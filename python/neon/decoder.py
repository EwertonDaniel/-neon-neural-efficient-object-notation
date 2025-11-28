"""
NEON Decoder Implementation
"""

import re
import time
from typing import Any, Callable, Dict, List, Optional, Tuple

from .types import (
    NEON_EXPANSIONS,
    NEON_SYMBOLS,
    NeonArray,
    NeonDecodeOptions,
    NeonObject,
    NeonStats,
    NeonSyntaxError,
    NeonValue,
)


def expand_number(s: str) -> float:
    """Expand abbreviated numbers."""
    if not s:
        return 0.0

    s = s.strip()

    if s.endswith("T"):
        return float(s[:-1]) * 1_000_000_000_000
    if s.endswith("B"):
        return float(s[:-1]) * 1_000_000_000
    if s.endswith("M"):
        return float(s[:-1]) * 1_000_000
    if s.endswith("K"):
        return float(s[:-1]) * 1_000

    # Leading dot decimal
    if s.startswith("."):
        return float("0" + s)
    if s.startswith("-."):
        return float("-0" + s[1:])

    return float(s)


class NeonLexer:
    """Tokenizer for NEON format."""

    def __init__(self, input_str: str):
        self.input = input_str
        self.pos = 0
        self.line = 1
        self.column = 1
        self.tokens: List[Dict[str, Any]] = []

    def tokenize(self) -> List[Dict[str, Any]]:
        """Tokenize the input string."""
        while self.pos < len(self.input):
            self._scan_token()

        self._add_token("EOF", "", "")
        return self.tokens

    def _scan_token(self) -> None:
        char = self.input[self.pos]

        # Skip whitespace (except newlines)
        if char in " \t\r":
            self._advance()
            return

        # Newline
        if char == "\n":
            self._add_token("NEWLINE", "\n", "\n")
            self._advance()
            self.line += 1
            self.column = 1
            return

        # Check indentation at start of line
        if self.column == 1 and char == " ":
            indent = ""
            while self.pos < len(self.input) and self.input[self.pos] == " ":
                indent += " "
                self._advance()
            if indent:
                self._add_token("INDENT", indent, indent)
            return

        # Symbols
        symbol_map = {
            NEON_SYMBOLS["ARRAY"]: "ARRAY_START",
            NEON_SYMBOLS["SCHEMA"]: "SCHEMA_START",
            NEON_SYMBOLS["OBJECT"]: "OBJECT_START",
            ":": "COLON",
            ",": "COMMA",
            NEON_SYMBOLS["LIST_ITEM"]: "LIST_ITEM",
        }

        if char in symbol_map:
            self._add_token(symbol_map[char], char, char)
            self._advance()
            return

        # Boolean shortcuts
        if char == NEON_SYMBOLS["TRUE"] and self._is_word_boundary(self.pos + 1):
            self._add_token("BOOLEAN", "true", char)
            self._advance()
            return

        if char == NEON_SYMBOLS["FALSE"] and self._is_word_boundary(self.pos + 1):
            self._add_token("BOOLEAN", "false", char)
            self._advance()
            return

        # Null shortcut
        if char == NEON_SYMBOLS["NULL"] and self._is_word_boundary(self.pos + 1):
            self._add_token("NULL", "null", char)
            self._advance()
            return

        # Quoted string
        if char == '"':
            self._scan_quoted_string()
            return

        # Number
        if self._is_number_start(char):
            self._scan_number()
            return

        # Unquoted string
        self._scan_unquoted_string()

    def _scan_quoted_string(self) -> None:
        self._advance()  # Skip opening quote
        start = self.pos
        value = ""

        while self.pos < len(self.input) and self.input[self.pos] != '"':
            if self.input[self.pos] == "\\":
                self._advance()
                if self.pos < len(self.input):
                    escape_char = self.input[self.pos]
                    escape_map = {"n": "\n", "r": "\r", "t": "\t", '"': '"', "\\": "\\"}
                    value += escape_map.get(escape_char, escape_char)
            else:
                value += self.input[self.pos]
            self._advance()

        raw = self.input[start : self.pos]
        self._advance()  # Skip closing quote
        self._add_token("STRING", value, f'"{raw}"')

    def _scan_number(self) -> None:
        start = self.pos

        # Optional negative sign
        if self.input[self.pos] == "-":
            self._advance()

        # Leading dot
        if self.pos < len(self.input) and self.input[self.pos] == ".":
            self._advance()

        # Digits
        while self.pos < len(self.input) and self.input[self.pos].isdigit():
            self._advance()

        # Decimal part
        if self.pos < len(self.input) and self.input[self.pos] == ".":
            self._advance()
            while self.pos < len(self.input) and self.input[self.pos].isdigit():
                self._advance()

        # Suffix (K, M, B, T)
        if self.pos < len(self.input) and self.input[self.pos] in "KMBT":
            self._advance()

        raw = self.input[start : self.pos]
        value = str(expand_number(raw))
        self._add_token("NUMBER", value, raw)

    def _scan_unquoted_string(self) -> None:
        start = self.pos
        delimiters = ' \t\n\r:,#@$~^>"'

        while self.pos < len(self.input) and self.input[self.pos] not in delimiters:
            self._advance()

        raw = self.input[start : self.pos]

        # Check for keywords
        if raw == "null":
            self._add_token("NULL", "null", raw)
        elif raw == "true":
            self._add_token("BOOLEAN", "true", raw)
        elif raw == "false":
            self._add_token("BOOLEAN", "false", raw)
        else:
            # Convert underscores to spaces
            value = raw.replace("_", " ")
            self._add_token("STRING", value, raw)

    def _is_number_start(self, char: str) -> bool:
        return char.isdigit() or char == "-" or char == "."

    def _is_word_boundary(self, pos: int) -> bool:
        if pos >= len(self.input):
            return True
        return self.input[pos] in ' \t\n\r:,#@$~^>"'

    def _advance(self) -> None:
        self.pos += 1
        self.column += 1

    def _add_token(self, token_type: str, value: str, raw: str) -> None:
        self.tokens.append({
            "type": token_type,
            "value": value,
            "raw": raw,
            "line": self.line,
            "column": self.column,
        })


class NeonParser:
    """Parser for NEON format."""

    def __init__(self, options: Optional[NeonDecodeOptions] = None):
        self.options = options or NeonDecodeOptions()
        self.tokens: List[Dict[str, Any]] = []
        self.current = 0
        self.depth = 0

    def parse(self, tokens: List[Dict[str, Any]]) -> NeonValue:
        """Parse tokens into a Python value."""
        self.tokens = tokens
        self.current = 0
        self.depth = 0

        self._skip_newlines()

        if self._is_at_end():
            return None

        return self._parse_value()

    def _parse_value(self) -> NeonValue:
        self.depth += 1

        if self.depth > self.options.max_depth:
            raise NeonSyntaxError(
                "MAX_DEPTH",
                f"Maximum depth of {self.options.max_depth} exceeded",
                self._peek().get("line", 0),
                self._peek().get("column", 0),
            )

        token = self._peek()
        if not token or token["type"] == "EOF":
            self.depth -= 1
            return None

        result: NeonValue = None

        # Check for named array first (e.g., "users#5^...")
        if token["type"] == "STRING":
            next_token = self._peek_next()
            if next_token and next_token["type"] == "ARRAY_START":
                result = self._parse_named_array()
                self.depth -= 1
                return result

        token_type = token["type"]

        if token_type == "NULL":
            self._advance()
            result = None
        elif token_type == "BOOLEAN":
            self._advance()
            result = token["value"] == "true"
        elif token_type == "NUMBER":
            self._advance()
            num = float(token["value"])
            result = int(num) if num.is_integer() else num
        elif token_type == "STRING":
            self._advance()
            result = self._expand_abbreviation(token["value"])
        elif token_type == "OBJECT_START":
            result = self._parse_object()
        elif token_type == "ARRAY_START":
            result = self._parse_array()
        else:
            self._advance()
            result = token["value"]

        self.depth -= 1
        return result

    def _parse_object(self) -> NeonObject:
        self._expect("OBJECT_START")
        obj: NeonObject = {}

        while not self._is_at_end() and not self._check("NEWLINE") and not self._check("EOF"):
            key_token = self._peek()
            if not key_token or key_token["type"] != "STRING":
                break

            self._advance()
            key = self._expand_abbreviation(key_token["value"])

            if self._check("COLON"):
                self._advance()

                if self._check("ARRAY_START"):
                    obj[key] = self._parse_array()
                elif self._check("NEWLINE"):
                    self._skip_newlines()
                    if self._check("INDENT"):
                        self._advance()
                        obj[key] = self._parse_value()
                    else:
                        obj[key] = None
                else:
                    obj[key] = self._parse_value()
            elif self._check("ARRAY_START"):
                obj[key] = self._parse_array()
            else:
                break

        return obj

    def _parse_array(self) -> NeonArray:
        self._expect("ARRAY_START")
        arr: NeonArray = []

        # Get length
        length_token = self._peek()
        if not length_token or length_token["type"] != "NUMBER":
            raise NeonSyntaxError(
                "SYNTAX",
                "Expected array length",
                length_token.get("line", 0) if length_token else 0,
                length_token.get("column", 0) if length_token else 0,
            )

        self._advance()
        length = int(float(length_token["value"]))

        if length == 0:
            return []

        # Check for schema
        schema: Optional[List[str]] = None
        if self._check("SCHEMA_START"):
            self._advance()
            schema = self._parse_schema()

        # Check for inline values
        if not self._check("NEWLINE") and not self._check("EOF"):
            # Inline primitive array
            while len(arr) < length and not self._is_at_end():
                if self._check("NEWLINE") or self._check("EOF"):
                    break
                arr.append(self._parse_value())

            return arr

        # Multiline array
        if schema:
            return self._parse_tabular_rows(length, schema)
        else:
            return self._parse_list_rows(length)

    def _parse_named_array(self) -> NeonObject:
        """Parse a named array like 'users#3^id,name'."""
        name_token = self._peek()
        self._advance()  # Skip name
        name = name_token["value"]

        arr = self._parse_array()
        return {name: arr}

    def _parse_schema(self) -> List[str]:
        """Parse schema fields."""
        fields: List[str] = []

        while not self._is_at_end():
            token = self._peek()
            if token["type"] != "STRING":
                break

            self._advance()
            fields.append(self._expand_abbreviation(token["value"]))

            if self._check("COMMA"):
                self._advance()
            else:
                break

        return fields

    def _parse_tabular_rows(self, length: int, fields: List[str]) -> NeonArray:
        """Parse tabular array rows."""
        result: NeonArray = []

        for _ in range(length):
            self._skip_newlines()

            if self._check("INDENT"):
                self._advance()

            obj: NeonObject = {}
            for i, field in enumerate(fields):
                if self._is_at_end() or self._check("NEWLINE"):
                    break
                obj[field] = self._parse_value()

            result.append(obj)

        return result

    def _parse_list_rows(self, length: int) -> NeonArray:
        """Parse list-style array rows."""
        result: NeonArray = []

        for _ in range(length):
            self._skip_newlines()

            if self._check("INDENT"):
                self._advance()

            if self._check("LIST_ITEM"):
                self._advance()

            result.append(self._parse_value())

        return result

    def _expand_abbreviation(self, value: str) -> str:
        """Expand field abbreviation if enabled."""
        if self.options.expand_abbreviations:
            return NEON_EXPANSIONS.get(value, value)
        return value

    def _peek(self) -> Optional[Dict[str, Any]]:
        if self.current >= len(self.tokens):
            return None
        return self.tokens[self.current]

    def _peek_next(self) -> Optional[Dict[str, Any]]:
        if self.current + 1 >= len(self.tokens):
            return None
        return self.tokens[self.current + 1]

    def _advance(self) -> Optional[Dict[str, Any]]:
        if not self._is_at_end():
            self.current += 1
        return self.tokens[self.current - 1] if self.current > 0 else None

    def _check(self, token_type: str) -> bool:
        if self._is_at_end():
            return False
        token = self._peek()
        return token is not None and token["type"] == token_type

    def _expect(self, token_type: str) -> Dict[str, Any]:
        if self._check(token_type):
            return self._advance()
        token = self._peek()
        raise NeonSyntaxError(
            "SYNTAX",
            f"Expected {token_type}",
            token.get("line", 0) if token else 0,
            token.get("column", 0) if token else 0,
        )

    def _is_at_end(self) -> bool:
        token = self._peek()
        return token is None or token["type"] == "EOF"

    def _skip_newlines(self) -> None:
        while self._check("NEWLINE"):
            self._advance()


class NeonDecoder:
    """NEON format decoder."""

    def __init__(self, options: Optional[NeonDecodeOptions] = None):
        self.options = options or NeonDecodeOptions()
        self.stats = NeonStats()

    def decode(self, input_str: str) -> NeonValue:
        """Decode a NEON string to Python value."""
        start_time = time.perf_counter()

        # Handle empty input
        if not input_str or not input_str.strip():
            return None

        # Tokenize
        lexer = NeonLexer(input_str)
        tokens = lexer.tokenize()

        # Parse
        parser = NeonParser(self.options)
        result = parser.parse(tokens)

        end_time = time.perf_counter()

        # Calculate stats
        import json
        output_str = json.dumps(result) if result is not None else ""
        self.stats = NeonStats(
            input_size=len(input_str),
            output_size=len(output_str),
            decode_time_ms=(end_time - start_time) * 1000,
        )

        return result

    def get_stats(self) -> NeonStats:
        """Get statistics from the last decode operation."""
        return self.stats


def decode(input_str: str, options: Optional[NeonDecodeOptions] = None) -> NeonValue:
    """Decode a NEON string to Python value."""
    decoder = NeonDecoder(options)
    return decoder.decode(input_str)


def decode_stream(
    input_str: str,
    callback: Callable[[NeonValue, int], None],
    options: Optional[NeonDecodeOptions] = None,
) -> None:
    """Decode NEON and process records via callback."""
    result = decode(input_str, options)

    if isinstance(result, dict):
        for key, value in result.items():
            if isinstance(value, list):
                for i, item in enumerate(value):
                    callback(item, i)
                return

    if isinstance(result, list):
        for i, item in enumerate(result):
            callback(item, i)
