"""Linux facilities omitted by some vendor Python builds."""
import ctypes
import os
import sys


def ensure_memfd():
    """Use libc's native anonymous RAM file when Python omits its wrapper."""
    if sys.platform != 'linux' or hasattr(os, 'memfd_create'):
        return
    libc = ctypes.CDLL(None, use_errno=True)
    native = libc.memfd_create
    native.argtypes = [ctypes.c_char_p, ctypes.c_uint]
    native.restype = ctypes.c_int

    def memfd_create(name, flags=1):
        fd = native(os.fsencode(name), flags)
        if fd < 0:
            error = ctypes.get_errno()
            raise OSError(error, os.strerror(error))
        return fd

    os.memfd_create = memfd_create
    if not hasattr(os, 'MFD_CLOEXEC'):
        os.MFD_CLOEXEC = 1
