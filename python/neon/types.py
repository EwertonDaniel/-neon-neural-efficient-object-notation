"""
NEON Type Definitions
"""

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Literal, Optional, Union

# Type aliases
NeonValue = Union[None, bool, int, float, str, List[Any], Dict[str, Any]]
NeonObject = Dict[str, Any]
NeonArray = List[Any]

# Symbols
NEON_SYMBOLS = {
    "ARRAY": "#",
    "SCHEMA": "^",
    "OBJECT": "@",
    "TRUE": "T",
    "FALSE": "F",
    "NULL": "N",
    "REFERENCE": "$",
    "PATH": "~",
    "TYPE": ">",
    "LIST_ITEM": "-",
}

# Field abbreviations
NEON_ABBREVIATIONS = {
    "department": "dept",
    "description": "desc",
    "configuration": "config",
    "application": "app",
    "environment": "env",
    "timestamp": "ts",
    "first_name": "fname",
    "last_name": "lname",
    "phone_number": "phone",
    "email_address": "emailaddr",
    "notifications": "notif",
    "conversions": "conv",
}

# Reverse abbreviations for decoding
NEON_EXPANSIONS = {v: k for k, v in NEON_ABBREVIATIONS.items()}


@dataclass
class NeonEncodeOptions:
    """Options for NEON encoding."""

    mode: Literal["readable", "compact", "ultra-compact"] = "compact"
    compress_numbers: bool = True
    compress_booleans: bool = True
    compress_nulls: bool = True
    compress_strings: bool = True
    abbreviate_fields: bool = False
    delimiter: str = " "
    line_ending: str = "\n"
    indent: int = 2
    enable_references: bool = False
    max_inline_array: int = 10
    abbreviation_map: Optional[Dict[str, str]] = None


@dataclass
class NeonDecodeOptions:
    """Options for NEON decoding."""

    strict: bool = True
    expand_abbreviations: bool = True
    max_depth: int = 100
    abbreviation_map: Optional[Dict[str, str]] = None


@dataclass
class NeonStats:
    """Statistics from encoding/decoding operations."""

    input_size: int = 0
    output_size: int = 0
    compression_ratio: float = 0.0
    savings_percent: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    encode_time_ms: float = 0.0
    decode_time_ms: float = 0.0


@dataclass
class NeonSchema:
    """Schema information for tabular data."""

    fields: List[str] = field(default_factory=list)
    types: List[str] = field(default_factory=list)


class NeonError(Exception):
    """Base exception for NEON operations."""

    def __init__(self, code: str, message: str, line: int = 0, column: int = 0):
        self.code = code
        self.message = message
        self.line = line
        self.column = column
        super().__init__(f"[{code}] {message} at line {line}, column {column}")


class NeonSyntaxError(NeonError):
    """Syntax error during parsing."""
    pass


class NeonTypeError(NeonError):
    """Type error during encoding/decoding."""
    pass
