"""
NEON Encoder Implementation
"""

import json
import re
import time
from typing import Any, Dict, List, Optional

from .types import (
    NEON_ABBREVIATIONS,
    NEON_SYMBOLS,
    NeonArray,
    NeonEncodeOptions,
    NeonObject,
    NeonStats,
    NeonValue,
)


def compress_number(n: float, enabled: bool = True) -> str:
    """Compress a number using K/M/B/T suffixes."""
    if not enabled:
        return str(n)

    abs_n = abs(n)
    sign = "-" if n < 0 else ""

    if abs_n >= 1_000_000_000_000:
        val = abs_n / 1_000_000_000_000
        return f"{sign}{val:.1f}T" if val % 1 else f"{sign}{int(val)}T"
    if abs_n >= 1_000_000_000:
        val = abs_n / 1_000_000_000
        return f"{sign}{val:.1f}B" if val % 1 else f"{sign}{int(val)}B"
    if abs_n >= 1_000_000:
        val = abs_n / 1_000_000
        return f"{sign}{val:.1f}M" if val % 1 else f"{sign}{int(val)}M"
    if abs_n >= 1_000:
        val = abs_n / 1_000
        return f"{sign}{val:.1f}K" if val % 1 else f"{sign}{int(val)}K"

    # Leading dot for small decimals
    if 0 < abs_n < 1:
        s = str(n)
        return s.replace("0.", ".")

    # Integer check
    if isinstance(n, float) and n.is_integer():
        return str(int(n))

    return str(n)


def needs_quotes(s: str, delimiter: str = " ") -> bool:
    """Check if a string needs to be quoted."""
    if not s:
        return True

    special_chars = ':"\\' + "\n\r\t"
    if delimiter != " ":
        special_chars += delimiter

    if any(c in s for c in special_chars):
        return True
    if s.startswith(" ") or s.endswith(" "):
        return True
    if s in (NEON_SYMBOLS["TRUE"], NEON_SYMBOLS["FALSE"], NEON_SYMBOLS["NULL"]):
        return True
    if re.match(r"^-?\d+(\.\d+)?[KMBT]?$", s):
        return True
    if s[0] in "#@$~^>-":
        return True

    return False


def escape_string(s: str) -> str:
    """Escape special characters in a string."""
    return (
        s.replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("\n", "\\n")
        .replace("\r", "\\r")
        .replace("\t", "\\t")
    )


class NeonEncoder:
    """NEON format encoder."""

    def __init__(self, options: Optional[NeonEncodeOptions] = None):
        self.options = options or NeonEncodeOptions()
        self.stats = NeonStats()
        self._reference_map: Dict[int, str] = {}
        self._reference_counter = 0

    def encode(self, value: NeonValue) -> str:
        """Encode a Python value to NEON format."""
        start_time = time.perf_counter()

        self._reference_map = {}
        self._reference_counter = 0

        result = self._encode_value(value, 0, "")

        end_time = time.perf_counter()

        # Calculate stats
        json_str = json.dumps(value)
        self.stats = NeonStats(
            input_size=len(json_str),
            output_size=len(result),
            compression_ratio=len(result) / len(json_str) if json_str else 0,
            savings_percent=round((1 - len(result) / len(json_str)) * 100) if json_str else 0,
            input_tokens=len(json_str) // 4,
            output_tokens=len(result) // 4,
            encode_time_ms=(end_time - start_time) * 1000,
        )

        return result

    def get_stats(self) -> NeonStats:
        """Get statistics from the last encode operation."""
        return self.stats

    def _encode_value(self, value: NeonValue, depth: int, context: str) -> str:
        """Encode any value."""
        if value is None:
            return NEON_SYMBOLS["NULL"] if self.options.compress_nulls else "null"

        if isinstance(value, bool):
            if self.options.compress_booleans:
                return NEON_SYMBOLS["TRUE"] if value else NEON_SYMBOLS["FALSE"]
            return "true" if value else "false"

        if isinstance(value, (int, float)):
            return compress_number(value, self.options.compress_numbers)

        if isinstance(value, str):
            return self._encode_string(value)

        if isinstance(value, list):
            return self._encode_array(value, depth)

        if isinstance(value, dict):
            return self._encode_object(value, depth)

        return str(value)

    def _encode_string(self, s: str) -> str:
        """Encode a string value."""
        if not s:
            return '""'

        if needs_quotes(s, self.options.delimiter):
            return f'"{escape_string(s)}"'

        # Replace spaces with underscores
        return s.replace(" ", "_")

    def _encode_key(self, key: str) -> str:
        """Encode an object key."""
        if not key:
            return '""'

        # Apply abbreviation if enabled
        if self.options.abbreviate_fields:
            key = NEON_ABBREVIATIONS.get(key, key)

        # Check if quoting needed
        if any(c in key for c in ':"\\' + "\n") or key.startswith(" ") or key.endswith(" "):
            return f'"{escape_string(key)}"'

        return key.replace(" ", "_")

    def _encode_array(self, arr: NeonArray, depth: int) -> str:
        """Encode an array."""
        if not arr:
            return f"{NEON_SYMBOLS['ARRAY']}0"

        # Check if tabular (uniform objects)
        if self._is_tabular(arr):
            return self._encode_tabular_array(arr, depth)

        # Check if primitive array
        if all(not isinstance(item, (list, dict)) for item in arr):
            return self._encode_primitive_array(arr)

        # Mixed array
        return self._encode_list_array(arr, depth)

    def _is_tabular(self, arr: NeonArray) -> bool:
        """Check if array is tabular (uniform objects)."""
        if not arr or not isinstance(arr[0], dict):
            return False

        first_keys = set(arr[0].keys())
        return all(
            isinstance(item, dict) and set(item.keys()) == first_keys
            for item in arr
        )

    def _encode_tabular_array(self, arr: List[NeonObject], depth: int) -> str:
        """Encode a tabular array with schema."""
        fields = list(arr[0].keys())
        schema_fields = [
            NEON_ABBREVIATIONS.get(f, f) if self.options.abbreviate_fields else f
            for f in fields
        ]

        result = f"{NEON_SYMBOLS['ARRAY']}{len(arr)}{NEON_SYMBOLS['SCHEMA']}{','.join(schema_fields)}"

        indent = " " * (self.options.indent * (depth + 1))

        for item in arr:
            values = [self._encode_value(item[f], depth + 1, f) for f in fields]
            result += f"{self.options.line_ending}{indent}{self.options.delimiter.join(values)}"

        return result

    def _encode_primitive_array(self, arr: NeonArray) -> str:
        """Encode a primitive array on a single line."""
        values = [self._encode_value(v, 0, "") for v in arr]
        return f"{NEON_SYMBOLS['ARRAY']}{len(arr)} {self.options.delimiter.join(values)}"

    def _encode_list_array(self, arr: NeonArray, depth: int) -> str:
        """Encode a mixed array as a list."""
        indent = " " * (self.options.indent * (depth + 1))
        result = f"{NEON_SYMBOLS['ARRAY']}{len(arr)}"

        for item in arr:
            encoded = self._encode_value(item, depth + 1, "")
            result += f"{self.options.line_ending}{indent}{NEON_SYMBOLS['LIST_ITEM']} {encoded}"

        return result

    def _encode_object(self, obj: NeonObject, depth: int) -> str:
        """Encode an object."""
        if not obj:
            return NEON_SYMBOLS["OBJECT"]

        entries = list(obj.items())

        # Check for root object with single array property
        if depth == 0 and len(entries) == 1:
            key, value = entries[0]
            if isinstance(value, list) and self._is_tabular(value):
                fields = list(value[0].keys())
                schema_fields = [
                    NEON_ABBREVIATIONS.get(f, f) if self.options.abbreviate_fields else f
                    for f in fields
                ]

                result = f"{key}{NEON_SYMBOLS['ARRAY']}{len(value)}{NEON_SYMBOLS['SCHEMA']}{','.join(schema_fields)}"
                indent = " " * self.options.indent

                for item in value:
                    values = [self._encode_value(item[f], 1, f) for f in fields]
                    result += f"{self.options.line_ending}{indent}{self.options.delimiter.join(values)}"

                return result

        # Standard object encoding
        parts = []

        for key, value in entries:
            encoded_key = self._encode_key(key)

            if isinstance(value, dict) and value:
                nested = self._encode_object(value, depth + 1)
                if self.options.mode in ("compact", "ultra-compact"):
                    parts.append(f"{encoded_key}:{{{nested[1:]}}}")
                else:
                    child_indent = " " * (self.options.indent * (depth + 1))
                    parts.append(f"{encoded_key}:{self.options.line_ending}{child_indent}{nested}")
            elif isinstance(value, list):
                encoded = self._encode_array(value, depth + 1)
                parts.append(f"{encoded_key}{encoded}")
            else:
                encoded = self._encode_value(value, depth, key)
                parts.append(f"{encoded_key}:{encoded}")

        return f"{NEON_SYMBOLS['OBJECT']}{' '.join(parts)}"


def encode(value: NeonValue, options: Optional[NeonEncodeOptions] = None) -> str:
    """Encode a Python value to NEON format."""
    encoder = NeonEncoder(options)
    return encoder.encode(value)


def encode_compact(value: NeonValue) -> str:
    """Encode with maximum compression."""
    options = NeonEncodeOptions(
        mode="compact",
        compress_numbers=True,
        compress_booleans=True,
        compress_nulls=True,
        abbreviate_fields=True,
    )
    return encode(value, options)
