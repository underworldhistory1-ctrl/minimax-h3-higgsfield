"""Exact native seed validation, shared by video and image submission."""
import math
import re


def seed_value(value):
    if isinstance(value, bool):
        raise ValueError('Seed must be a whole number')
    if isinstance(value, str):
        if not re.fullmatch(r'[0-9]{1,20}', value.strip()):
            raise ValueError('Seed must be a whole number')
        value = int(value)
    elif isinstance(value, float):
        if not math.isfinite(value) or not value.is_integer() or abs(value) > 2**53 - 1:
            raise ValueError('Seed must be an exact whole number')
        value = int(value)
    if not isinstance(value, int) or not 0 <= value <= 2**64 - 1:
        raise ValueError('Seed must be between 0 and 18446744073709551615')
    return value
