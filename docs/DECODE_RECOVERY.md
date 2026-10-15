# Completed-latent recovery

The Linux worker supervisor restarts its own crashed ComfyUI worker. Every ten
seconds it checks for completed sampler checkpoints, an idle queue and open
Studio admission. It does not replay lost sampling jobs or pending queue entries.

Recovery uses `POST /h3_studio/lab/jobs/{parent_id}/recover` with an empty JSON
object. The server reads the stored parent workflow and saved latent; clients
cannot supply a recovery workflow or a latent filename. Supported decode, VAE,
AV trim, crop, scale, assembly and save nodes are retained. Any other downstream
dependency, including a sampler or `LoadAudio`, prevents automatic recovery.

The server creates one durable child job with a deterministic new request token,
`recovery_of`, the same project and a new output filename prefix. The parent and
its `recovery_job_id` link are saved in the same manifest transaction before queue
submission. The original failed state remains unchanged. The child follows normal
job acknowledgement, progress, output reconciliation and cancellation. Cancelling
the failed parent forwards to its active recovery child; cancelling it before a
child exists reserves cancellation and prevents later automatic recovery.

Repeated recovery requests return the same child. A lost submission reply is
reconciled against queue/history identity and never causes blind resubmission.
An uncertain child or a failed decode requires inspection; the supervisor does
not create another child automatically. Legacy untracked recovery markers are
retained for manual reconciliation, to avoid duplicate output.

The completed latent is written before model unloading. A model-unload, decode
or encode failure retains it. An existing MP4 alone never authorizes checkpoint
deletion. Recovery writes a separate output; the original checkpoint and durable
AV context remain available for inspection and supported continuation.

There is no checkpoint during sampling, so a worker loss at step 19/20 cannot be
resumed from that step. Queue records preserve intent and cancellation, not the
worker's in-memory execution state. Unsupported graphs, missing/corrupt data and
closed maintenance admission fail closed. The supervisor currently scans the
default `ComfyUI/output` directory; a custom output directory requires a matching
configuration change. Idle/admission checks do not prevent independent raw
ComfyUI clients from submitting work concurrently, but recovery remains an
ordinary queued job and never interrupts that work.
