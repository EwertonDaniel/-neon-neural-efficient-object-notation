"""
NEON - Neural Efficient Object Notation

Token-efficient data serialization for AI/LLM applications.

Usage:
    >>> import neon
    >>> data = {"users": [{"id": 1, "name": "Alice", "active": True}]}
    >>> encoded = neon.encode(data)
    >>> decoded = neon.decode(encoded)
"""

from .encoder import encode, encode_compact, NeonEncoder
from .decoder import decode, decode_stream, NeonDecoder
from .types import NeonEncodeOptions, NeonDecodeOptions

__version__ = "2.0.0"
__author__ = "Ewerton Daniel"
__all__ = [
    "encode",
    "encode_compact",
    "decode",
    "decode_stream",
    "NeonEncoder",
    "NeonDecoder",
    "NeonEncodeOptions",
    "NeonDecodeOptions",
]
