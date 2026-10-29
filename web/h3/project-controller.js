/**
 * H3 Studio Lab — Project Controller
 *
 * Manages project state, revision tracking, atomic saves, and Qwen image handoff.
 * All client-side storage keys are namespaced by server identity to avoid cross-server collision.
 */

(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.H3ProjectController = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  class ProjectController {
    constructor(options = {}) {
      this.apiBase = options.apiBase || '';
      this.serverKey = options.serverKey || 'default';
      this.currentProject = null;
      this.onProjectChanged = options.onProjectChanged || (() => {});
      this.assetRecords = new Map();
      this.assetMedia = new Map();
      this.mediaBytes = 0;
    }

    _storageKey(key) {
      return `h3_lab.${this.serverKey}.${key}`;
    }

    apiUrl(endpoint) {
      return (this.apiBase || '').replace(/\/$/, '') + endpoint;
    }

    async fetchJson(endpoint, options = {}) {
      const mutation=options.method&&options.method.toUpperCase()!=='GET';
      if(mutation)this.projectListRequest=null;
      const res = await fetch(this.apiUrl(endpoint), {
        signal: AbortSignal.timeout(options.body instanceof Blob ? 10 * 60 * 1000 : 60000),
        ...options,
        headers: { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(options.headers || {}) },
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const errData = await res.json();
          msg = errData.error || errData.message || msg;
        } catch {}
        const err = new Error(msg);
        err.status = res.status;
        throw err;
      }
      const data=await (globalThis.H3RenderValues?H3RenderValues.readJson(res):res.json());
      if(mutation)this.projectListRequest=null;
      return data;
    }

    async uploadAsset(file, projectId = this.currentProject?.project_id, options = {}) {
      const query = new URLSearchParams({filename: file.name || 'reference.png'});
      if (projectId) query.set('project_id', projectId);
      for (const key of ['category', 'name']) if (options[key]) query.set(key, options[key]);
      const data = await this.fetchJson('/h3_studio/lab/assets?' + query, {
        method: 'POST', body: file, headers: {'Content-Type': 'application/octet-stream'},
      });
      return data.asset || data;
    }

    async getAsset(assetId) {
      if (!this.assetRecords.has(assetId)) {
        const request = this.fetchJson(`/h3_studio/lab/assets/${encodeURIComponent(assetId)}`,{signal:AbortSignal.timeout(45000)})
          .then(data => data.asset || data).catch(error => { this.assetRecords.delete(assetId); throw error; });
        this.assetRecords.set(assetId, request);
      }
      return this.assetRecords.get(assetId);
    }

    async resolveAsset(assetId) {
      const data = await this.fetchJson(`/h3_studio/lab/assets/${encodeURIComponent(assetId)}/resolve`, { method: 'POST', body: '{}' });
      if (!data.filename) throw new Error('Asset resolution returned no server filename.');
      return data.filename;
    }

    async mediaBlob(assetId) {
      if (this.assetMedia.has(assetId)) {
        const entry = this.assetMedia.get(assetId);
        this.assetMedia.delete(assetId);this.assetMedia.set(assetId,entry);
        return entry.promise;
      }
      const entry = {bytes:0};
      entry.promise = this.downloadMedia(assetId).then(blob => {
        // Originals are immutable by asset ID. Bound retained media to 64 MB;
        // large videos share an in-flight download but are not retained.
        if (blob.size > 8*1024*1024) this.assetMedia.delete(assetId);
        else {
          entry.bytes=blob.size;this.mediaBytes+=blob.size;
          for (const [id,cached] of this.assetMedia) {
            if(this.mediaBytes<=64*1024*1024)break;
            if(!cached.bytes)continue;
            this.assetMedia.delete(id);this.mediaBytes-=cached.bytes;
          }
        }
        return blob;
      }).catch(error => {this.assetMedia.delete(assetId);throw error;});
      this.assetMedia.set(assetId,entry);
      return entry.promise;
    }

    async downloadMedia(assetId) {
      for(let attempt=0;attempt<3;attempt++){
        const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),45000);
        try{
          const res=await fetch(this.apiUrl(`/h3_studio/lab/assets/${encodeURIComponent(assetId)}/file`),{signal:abort.signal});
          if(!res.ok){const error=new Error(`Cannot load asset media: HTTP ${res.status}`);error.status=res.status;throw error;}
          return await res.blob();
        }catch(error){
          if(attempt===2||(error.status&&![408,429,500,502,503,504].includes(error.status)))throw error;
          await new Promise(resolve=>setTimeout(resolve,250*(attempt+1)));
        }finally{clearTimeout(timeout);}
      }
    }

    async importBundle(file) {
      const body = new FormData();
      body.append('file', file);
      const project = await this.fetchJson('/h3_studio/lab/projects/import', { method: 'POST', body });
      return this.loadProject(project.project_id);
    }

    async createProject(name = 'New Project', canvas = null) {
      const key=JSON.stringify([name,canvas]);
      if(this.pendingCreate?.key!==key)this.pendingCreate={key,requestId:crypto.randomUUID()};
      const data = await this.fetchJson('/h3_studio/lab/projects', {
        method: 'POST',
        body: JSON.stringify({ name, canvas, request_id: this.pendingCreate.requestId }),
      });
      this.pendingCreate=null;
      this.currentProject = data;
      this.draftScope = {};
      try {
        const stored = JSON.parse(sessionStorage.getItem(this._storageKey('scene_scope.' + data.project_id)) || '{}');
        if (globalThis.H3Scenes) this.draftScope = globalThis.H3Scenes.validateScope(data, stored);
      } catch {}
      sessionStorage.setItem(this._storageKey('active_project_id'), data.project_id);
      this.onProjectChanged(this.currentProject);
      return data;
    }

    async loadProject(projectId) {
      const data = await this.fetchJson(`/h3_studio/lab/projects/${encodeURIComponent(projectId)}`);
      this.currentProject = data;
      this.draftScope = {};
      try {
        const stored = JSON.parse(sessionStorage.getItem(this._storageKey('scene_scope.' + data.project_id)) || '{}');
        if (globalThis.H3Scenes) this.draftScope = globalThis.H3Scenes.validateScope(data, stored);
      } catch {}
      sessionStorage.setItem(this._storageKey('active_project_id'), data.project_id);
      this.onProjectChanged(this.currentProject);
      return data;
    }

    async saveCurrentProject(updates = {}) {
      if (!this.currentProject) {
        throw new Error('No active project loaded');
      }
      const expectedRev = this.currentProject.revision;
      let merged = { ...this.currentProject, ...updates };
      if (Object.prototype.hasOwnProperty.call(updates, "draft") && this.draftScope?.scene_id) {
        merged = globalThis.H3Scenes.withDraft(merged, this.draftScope, updates.draft);
        merged.draft = this.currentProject.draft;
      }
      const savingProjectId = this.currentProject.project_id;

      const saved = await this.fetchJson(`/h3_studio/lab/projects/${encodeURIComponent(this.currentProject.project_id)}`, {
        method: 'POST',
        body: JSON.stringify({
          project: merged,
          expected_revision: expectedRev,
        }),
      });

      if (this.currentProject?.project_id === savingProjectId) {
        this.currentProject = saved;
        this.onProjectChanged(this.currentProject);
      }
      return saved;
    }

    async listProjects() {
      if(!this.projectListRequest){
        const request=this.fetchJson('/h3_studio/lab/projects').finally(()=>{if(this.projectListRequest===request)this.projectListRequest=null;});
        this.projectListRequest=request;
      }
      return this.projectListRequest;
    }

    async duplicateCurrentProject(newName = null) {
      if (!this.currentProject) throw new Error('No active project loaded');
      const copy = await this.fetchJson(`/h3_studio/lab/projects/${encodeURIComponent(this.currentProject.project_id)}/duplicate`, {
        method: 'POST',
        body: JSON.stringify({ name: newName }),
      });
      this.currentProject = copy;
      this.draftScope = {};
      sessionStorage.setItem(this._storageKey('active_project_id'), copy.project_id);
      this.onProjectChanged(this.currentProject);
      return copy;
    }

    async exportBundle(projectId) {
      const pid = projectId || this.currentProject?.project_id;
      if (!pid) throw new Error('No project to export');
      return this.apiUrl(`/h3_studio/lab/projects/${encodeURIComponent(pid)}/export`);
    }

    async importQwenImageToH3(imageFilename, asRole = 'reference', alias = null) {
      if (!this.currentProject) {
        await this.createProject('Qwen Project');
      }
      const data = await this.fetchJson('/h3_studio/lab/import_qwen_image', {
        method: 'POST',
        body: JSON.stringify({
          image_filename: imageFilename,
          project_id: this.currentProject.project_id,
          as_role: asRole,
          alias: alias,
        }),
      });
      await this.loadProject(this.currentProject.project_id);
      return data;
    }
  }

  return {
    ProjectController,
  };
});
