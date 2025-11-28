//! NEON Benchmarks

use criterion::{black_box, criterion_group, criterion_main, Criterion};
use neon::{decode, encode, encode_compact};
use serde_json::json;

fn generate_employees(count: usize) -> serde_json::Value {
    let departments = ["Engineering", "Sales", "Marketing", "HR", "Operations"];
    let employees: Vec<serde_json::Value> = (1..=count)
        .map(|i| {
            let dept = departments[i % 5];
            json!({
                "id": i,
                "name": format!("Employee {}", i),
                "email": format!("emp{}@company.com", i),
                "department": dept,
                "salary": 50000 + (i * 1000) % 100000,
                "years": i % 20,
                "active": i % 10 != 0
            })
        })
        .collect();

    json!({ "employees": employees })
}

fn benchmark_encode(c: &mut Criterion) {
    let data_10 = generate_employees(10);
    let data_100 = generate_employees(100);
    let data_1000 = generate_employees(1000);

    c.bench_function("encode_10", |b| {
        b.iter(|| encode(black_box(&data_10), None))
    });

    c.bench_function("encode_100", |b| {
        b.iter(|| encode(black_box(&data_100), None))
    });

    c.bench_function("encode_1000", |b| {
        b.iter(|| encode(black_box(&data_1000), None))
    });

    c.bench_function("encode_compact_1000", |b| {
        b.iter(|| encode_compact(black_box(&data_1000)))
    });
}

fn benchmark_decode(c: &mut Criterion) {
    let data_10 = generate_employees(10);
    let data_100 = generate_employees(100);
    let data_1000 = generate_employees(1000);

    let neon_10 = encode(&data_10, None).unwrap();
    let neon_100 = encode(&data_100, None).unwrap();
    let neon_1000 = encode(&data_1000, None).unwrap();

    c.bench_function("decode_10", |b| {
        b.iter(|| decode(black_box(&neon_10), None))
    });

    c.bench_function("decode_100", |b| {
        b.iter(|| decode(black_box(&neon_100), None))
    });

    c.bench_function("decode_1000", |b| {
        b.iter(|| decode(black_box(&neon_1000), None))
    });
}

fn benchmark_roundtrip(c: &mut Criterion) {
    let data = generate_employees(100);

    c.bench_function("roundtrip_100", |b| {
        b.iter(|| {
            let encoded = encode(black_box(&data), None).unwrap();
            decode(black_box(&encoded), None)
        })
    });
}

fn benchmark_json_comparison(c: &mut Criterion) {
    let data = generate_employees(1000);

    c.bench_function("json_serialize_1000", |b| {
        b.iter(|| serde_json::to_string(black_box(&data)))
    });

    c.bench_function("neon_encode_1000", |b| {
        b.iter(|| encode(black_box(&data), None))
    });

    let json_str = serde_json::to_string(&data).unwrap();
    let neon_str = encode(&data, None).unwrap();

    c.bench_function("json_deserialize_1000", |b| {
        b.iter(|| serde_json::from_str::<serde_json::Value>(black_box(&json_str)))
    });

    c.bench_function("neon_decode_1000", |b| {
        b.iter(|| decode(black_box(&neon_str), None))
    });
}

criterion_group!(
    benches,
    benchmark_encode,
    benchmark_decode,
    benchmark_roundtrip,
    benchmark_json_comparison
);
criterion_main!(benches);
