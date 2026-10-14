"""Bounded reference transports with shared downstream media validation."""
import base64
import binascii
import io
import json


async def reference_upload(request, kind, max_bytes):
    """Return a filename and bounded chunk reader; media verification stays shared."""
    if request.content_type == 'application/octet-stream':
        name = request.query.get('filename', '')
        if not name or len(name) > 255 or any(ord(c) in (0, 47, 92) for c in name):
            raise ValueError('Invalid reference filename.')
        if request.content_length is not None and request.content_length > max_bytes:
            raise ValueError('Reference file is too large.')

        async def read_binary_chunk(size):
            return await request.content.read(size)

        return name, read_binary_chunk
    if request.content_type != 'application/json':
        if request.content_type != 'multipart/form-data':
            raise ValueError('Use binary, JSON image, or multipart reference uploads.')
        reader = await request.multipart()
        part = await reader.next()
        if not part or part.name != 'file':
            raise ValueError('Missing file.')
        return part.filename or '', part.read_chunk
    if kind != 'image':
        raise ValueError('JSON reference uploads support images only.')
    encoded_limit = 4 * ((max_bytes + 2) // 3)
    raw = bytearray()
    async for chunk in request.content.iter_chunked(1 << 20):
        if len(raw) + len(chunk) > encoded_limit + 4096:
            raise ValueError('Reference file is too large.')
        raw.extend(chunk)
    try:
        body = json.loads(raw)
        if not isinstance(body, dict) or set(body) != {'filename', 'data'}:
            raise ValueError('Use filename and base64 data for an image upload.')
        name, encoded = body['filename'], body['data']
        if not isinstance(name, str) or not name or len(name) > 255 or any(ord(c) in (0, 47, 92) for c in name):
            raise ValueError('Invalid image filename.')
        if not isinstance(encoded, str) or len(encoded) > encoded_limit:
            raise ValueError('Reference file is too large or has invalid data.')
        payload = base64.b64decode(encoded, validate=True)
    except (UnicodeError, binascii.Error, json.JSONDecodeError) as error:
        raise ValueError('Invalid base64 image upload.') from error
    if not payload or len(payload) > max_bytes:
        raise ValueError('Reference file is empty or too large.')
    buffer = io.BytesIO(payload)

    async def read_chunk(size):
        return buffer.read(size)

    return name, read_chunk
