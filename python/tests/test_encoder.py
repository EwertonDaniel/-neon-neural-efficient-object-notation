"""
Tests for NEON Encoder
"""

import pytest
from neon import encode, encode_compact, NeonEncodeOptions


class TestPrimitives:
    """Test primitive value encoding."""

    def test_encode_null(self):
        assert encode(None) == "N"

    def test_encode_null_strict(self):
        options = NeonEncodeOptions(compress_nulls=False)
        assert encode(None, options) == "null"

    def test_encode_true(self):
        assert encode(True) == "T"

    def test_encode_false(self):
        assert encode(False) == "F"

    def test_encode_boolean_strict(self):
        options = NeonEncodeOptions(compress_booleans=False)
        assert encode(True, options) == "true"
        assert encode(False, options) == "false"

    def test_encode_integer(self):
        assert encode(42) == "42"

    def test_encode_negative_integer(self):
        assert encode(-42) == "-42"

    def test_encode_decimal(self):
        assert encode(3.14) == "3.14"

    def test_encode_small_decimal(self):
        assert encode(0.5) == ".5"

    def test_encode_thousands(self):
        assert encode(95000) == "95K"

    def test_encode_millions(self):
        assert encode(2500000) == "2.5M"

    def test_encode_billions(self):
        assert encode(1000000000) == "1B"

    def test_encode_number_no_compression(self):
        options = NeonEncodeOptions(compress_numbers=False)
        assert encode(95000, options) == "95000"


class TestStrings:
    """Test string encoding."""

    def test_encode_simple_string(self):
        assert encode("hello") == "hello"

    def test_encode_string_with_spaces(self):
        assert encode("hello world") == "hello_world"

    def test_encode_string_with_colon(self):
        assert encode("key:value") == '"key:value"'

    def test_encode_string_with_quotes(self):
        assert encode('say "hello"') == '"say \\"hello\\""'

    def test_encode_string_with_newline(self):
        assert encode("line1\nline2") == '"line1\\nline2"'

    def test_encode_empty_string(self):
        assert encode("") == '""'

    def test_encode_numeric_string(self):
        assert encode("123") == '"123"'

    def test_encode_boolean_like_string(self):
        assert encode("T") == '"T"'


class TestArrays:
    """Test array encoding."""

    def test_encode_empty_array(self):
        assert encode([]) == "#0"

    def test_encode_primitive_array(self):
        result = encode([1, 2, 3])
        assert result == "#3 1 2 3"

    def test_encode_string_array(self):
        result = encode(["a", "b", "c"])
        assert result == "#3 a b c"

    def test_encode_boolean_array(self):
        result = encode([True, False, True])
        assert result == "#3 T F T"


class TestObjects:
    """Test object encoding."""

    def test_encode_empty_object(self):
        assert encode({}) == "@"

    def test_encode_simple_object(self):
        result = encode({"id": 1, "name": "Alice"})
        assert "@" in result
        assert "id:1" in result
        assert "name:Alice" in result

    def test_encode_object_with_boolean(self):
        result = encode({"active": True})
        assert "active:T" in result


class TestTabularArrays:
    """Test tabular array encoding."""

    def test_encode_tabular_array(self):
        data = {
            "users": [
                {"id": 1, "name": "Alice", "active": True},
                {"id": 2, "name": "Bob", "active": False},
            ]
        }
        result = encode(data)
        assert "users#2^id,name,active" in result
        assert "1 Alice T" in result
        assert "2 Bob F" in result

    def test_encode_tabular_with_numbers(self):
        data = {
            "employees": [
                {"id": 1, "salary": 95000},
                {"id": 2, "salary": 75000},
            ]
        }
        result = encode(data)
        assert "95K" in result
        assert "75K" in result


class TestRoundTrip:
    """Test encode-decode round trip."""

    def test_roundtrip_simple_object(self):
        from neon import decode
        data = {"id": 1, "name": "Alice"}
        encoded = encode(data)
        decoded = decode(encoded)
        assert decoded == data

    def test_roundtrip_tabular(self):
        from neon import decode
        data = {
            "users": [
                {"id": 1, "name": "Alice", "active": True},
                {"id": 2, "name": "Bob", "active": False},
            ]
        }
        encoded = encode(data)
        decoded = decode(encoded)
        assert decoded == data


class TestCompactMode:
    """Test compact encoding mode."""

    def test_encode_compact(self):
        data = {"salary": 95000, "active": True}
        result = encode_compact(data)
        assert "95K" in result
        assert "T" in result
