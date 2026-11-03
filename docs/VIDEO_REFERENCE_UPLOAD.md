# Reference and control uploads

Uploads share bounded request/stream handling, actual media probing and failure/cancel/timeout cleanup. Corrupt or unsupported input does not replace valid references. Images also support JSON/base64 for gateways rejecting multipart.

Reference video guides a new generation; structural control maps are separate inputs. A control source is not automatically duplicated into References. Still control images provide constant guidance. Source soundtrack reuse is distinct from generated-audio references. Reference trims respect separate video and standalone-audio budgets; paired video audio does not consume standalone slots.

Tests cover transfer limits, chunked requests, corrupt media and cancellation without GPU inference. [Compatibility](COMPATIBILITY_MATRIX.md) · [Image behavior](IMAGE_WORKSPACE_FIX.md).
