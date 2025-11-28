//! NEON CLI Tool
//!
//! Command-line interface for encoding and decoding NEON format.

use clap::{Parser, Subcommand};
use colored::*;
use neon::{decode, encode, encode_compact, NeonDecodeOptions, NeonEncodeOptions};
use serde_json::Value;
use std::fs;
use std::io::{self, Read, Write};
use std::path::PathBuf;
use std::time::Instant;

#[derive(Parser)]
#[command(name = "neon")]
#[command(author = "Ewerton Daniel")]
#[command(version = "2.0.0")]
#[command(about = "NEON - Neural Efficient Object Notation", long_about = None)]
#[command(propagate_version = true)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Encode JSON to NEON format
    Encode {
        /// Input file (use - for stdin)
        #[arg(short, long)]
        input: Option<PathBuf>,

        /// Output file (use - for stdout)
        #[arg(short, long)]
        output: Option<PathBuf>,

        /// Use compact mode (maximum compression)
        #[arg(short, long)]
        compact: bool,

        /// Abbreviate field names
        #[arg(short, long)]
        abbreviate: bool,

        /// Show statistics
        #[arg(short, long)]
        stats: bool,
    },

    /// Decode NEON to JSON format
    Decode {
        /// Input file (use - for stdin)
        #[arg(short, long)]
        input: Option<PathBuf>,

        /// Output file (use - for stdout)
        #[arg(short, long)]
        output: Option<PathBuf>,

        /// Pretty print JSON output
        #[arg(short, long)]
        pretty: bool,

        /// Show statistics
        #[arg(short, long)]
        stats: bool,
    },

    /// Compare JSON and NEON sizes
    Compare {
        /// Input JSON file
        #[arg(short, long)]
        input: Option<PathBuf>,

        /// Show detailed breakdown
        #[arg(short, long)]
        detailed: bool,
    },

    /// Validate NEON format
    Validate {
        /// Input file (use - for stdin)
        #[arg(short, long)]
        input: Option<PathBuf>,
    },

    /// Show format information and examples
    Info,
}

fn main() {
    let cli = Cli::parse();

    let result = match cli.command {
        Commands::Encode {
            input,
            output,
            compact,
            abbreviate,
            stats,
        } => cmd_encode(input, output, compact, abbreviate, stats),
        Commands::Decode {
            input,
            output,
            pretty,
            stats,
        } => cmd_decode(input, output, pretty, stats),
        Commands::Compare { input, detailed } => cmd_compare(input, detailed),
        Commands::Validate { input } => cmd_validate(input),
        Commands::Info => cmd_info(),
    };

    if let Err(e) = result {
        eprintln!("{}: {}", "Error".red().bold(), e);
        std::process::exit(1);
    }
}

fn read_input(path: Option<PathBuf>) -> io::Result<String> {
    match path {
        Some(p) if p.to_string_lossy() != "-" => fs::read_to_string(p),
        _ => {
            let mut buffer = String::new();
            io::stdin().read_to_string(&mut buffer)?;
            Ok(buffer)
        }
    }
}

fn write_output(path: Option<PathBuf>, content: &str) -> io::Result<()> {
    match path {
        Some(p) if p.to_string_lossy() != "-" => fs::write(p, content),
        _ => {
            io::stdout().write_all(content.as_bytes())?;
            io::stdout().write_all(b"\n")?;
            Ok(())
        }
    }
}

fn cmd_encode(
    input: Option<PathBuf>,
    output: Option<PathBuf>,
    compact: bool,
    abbreviate: bool,
    show_stats: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let json_str = read_input(input)?;
    let value: Value = serde_json::from_str(&json_str)?;

    let start = Instant::now();

    let result = if compact {
        encode_compact(&value)?
    } else {
        let options = NeonEncodeOptions {
            abbreviate_fields: abbreviate,
            ..Default::default()
        };
        encode(&value, Some(options))?
    };

    let elapsed = start.elapsed();

    write_output(output, &result)?;

    if show_stats {
        let json_size = json_str.len();
        let neon_size = result.len();
        let savings = ((1.0 - neon_size as f64 / json_size as f64) * 100.0) as i32;

        eprintln!();
        eprintln!("{}", "Statistics:".cyan().bold());
        eprintln!("  JSON size:     {} bytes", json_size);
        eprintln!("  NEON size:     {} bytes", neon_size);
        eprintln!(
            "  Savings:       {}% ({})",
            savings,
            format!("-{} bytes", json_size - neon_size).green()
        );
        eprintln!("  JSON tokens:   ~{}", json_size / 4);
        eprintln!("  NEON tokens:   ~{}", neon_size / 4);
        eprintln!("  Encode time:   {:.2}ms", elapsed.as_secs_f64() * 1000.0);
    }

    Ok(())
}

fn cmd_decode(
    input: Option<PathBuf>,
    output: Option<PathBuf>,
    pretty: bool,
    show_stats: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let neon_str = read_input(input)?;

    let start = Instant::now();

    let value = decode(&neon_str, Some(NeonDecodeOptions::default()))?;

    let elapsed = start.elapsed();

    let result = if pretty {
        serde_json::to_string_pretty(&value)?
    } else {
        serde_json::to_string(&value)?
    };

    write_output(output, &result)?;

    if show_stats {
        let neon_size = neon_str.len();
        let json_size = result.len();

        eprintln!();
        eprintln!("{}", "Statistics:".cyan().bold());
        eprintln!("  NEON size:     {} bytes", neon_size);
        eprintln!("  JSON size:     {} bytes", json_size);
        eprintln!("  Decode time:   {:.2}ms", elapsed.as_secs_f64() * 1000.0);
    }

    Ok(())
}

fn cmd_compare(
    input: Option<PathBuf>,
    detailed: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let json_str = read_input(input)?;
    let value: Value = serde_json::from_str(&json_str)?;

    // JSON sizes
    let json_minified = serde_json::to_string(&value)?;
    let json_pretty = serde_json::to_string_pretty(&value)?;

    // NEON sizes
    let neon_default = encode(&value, None)?;
    let neon_compact = encode_compact(&value)?;

    println!("{}", "=== NEON Format Comparison ===".cyan().bold());
    println!();

    // Size table
    println!("{}", "Size Comparison:".yellow().bold());
    println!("┌────────────────────┬────────────┬────────────┬──────────┐");
    println!("│ Format             │ Size       │ Tokens     │ vs JSON  │");
    println!("├────────────────────┼────────────┼────────────┼──────────┤");

    let formats = [
        ("JSON (pretty)", json_pretty.len()),
        ("JSON (minified)", json_minified.len()),
        ("NEON (default)", neon_default.len()),
        ("NEON (compact)", neon_compact.len()),
    ];

    let base_size = json_minified.len();

    for (name, size) in formats {
        let tokens = size / 4;
        let savings = if name.contains("JSON") {
            "-".to_string()
        } else {
            format!("-{}%", ((1.0 - size as f64 / base_size as f64) * 100.0) as i32)
        };

        println!(
            "│ {:<18} │ {:>10} │ {:>10} │ {:>8} │",
            name,
            format!("{} B", size),
            format!("~{}", tokens),
            savings
        );
    }

    println!("└────────────────────┴────────────┴────────────┴──────────┘");

    if detailed {
        println!();
        println!("{}", "Sample Output:".yellow().bold());
        println!();

        println!("{}:", "NEON (default)".green());
        let preview: String = neon_default.chars().take(500).collect();
        println!("{}", preview);
        if neon_default.len() > 500 {
            println!("... ({} more chars)", neon_default.len() - 500);
        }

        println!();
        println!("{}:", "NEON (compact)".green());
        let preview: String = neon_compact.chars().take(500).collect();
        println!("{}", preview);
        if neon_compact.len() > 500 {
            println!("... ({} more chars)", neon_compact.len() - 500);
        }
    }

    // Cost analysis
    println!();
    println!("{}", "LLM Cost Analysis (at $0.01/1K tokens):".yellow().bold());

    let json_tokens = json_minified.len() / 4;
    let neon_tokens = neon_compact.len() / 4;
    let cost_json = (json_tokens as f64 / 1000.0) * 0.01;
    let cost_neon = (neon_tokens as f64 / 1000.0) * 0.01;
    let savings_per_1k = (cost_json - cost_neon) * 1000.0;
    let annual_savings = savings_per_1k * 1000.0;

    println!("  JSON cost/request:  ${:.6}", cost_json);
    println!("  NEON cost/request:  ${:.6}", cost_neon);
    println!(
        "  Savings per 1K:     {}",
        format!("${:.2}", savings_per_1k).green()
    );
    println!(
        "  Annual (1M req):    {}",
        format!("${:.0}", annual_savings).green().bold()
    );

    Ok(())
}

fn cmd_validate(input: Option<PathBuf>) -> Result<(), Box<dyn std::error::Error>> {
    let neon_str = read_input(input)?;

    match decode(&neon_str, Some(NeonDecodeOptions::default())) {
        Ok(_) => {
            println!("{} Valid NEON format", "✓".green());
            Ok(())
        }
        Err(e) => {
            println!("{} Invalid NEON format: {}", "✗".red(), e);
            std::process::exit(1);
        }
    }
}

fn cmd_info() -> Result<(), Box<dyn std::error::Error>> {
    println!(
        "{}",
        r#"
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║   ███╗   ██╗███████╗ ██████╗ ███╗   ██╗                          ║
║   ████╗  ██║██╔════╝██╔═══██╗████╗  ██║                          ║
║   ██╔██╗ ██║█████╗  ██║   ██║██╔██╗ ██║                          ║
║   ██║╚██╗██║██╔══╝  ██║   ██║██║╚██╗██║                          ║
║   ██║ ╚████║███████╗╚██████╔╝██║ ╚████║                          ║
║   ╚═╝  ╚═══╝╚══════╝ ╚═════╝ ╚═╝  ╚═══╝                          ║
║                                                                   ║
║   Neural Efficient Object Notation v2.0                           ║
║   Token-efficient data serialization for AI/LLM                   ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
"#
        .cyan()
    );

    println!("{}", "Syntax Reference:".yellow().bold());
    println!();
    println!("  {}  Array with count      items#3", "#".green().bold());
    println!("  {}  Schema definition     #3^id,name,active", "^".green().bold());
    println!("  {}  Object                @id:1 name:Alice", "@".green().bold());
    println!("  {}  True boolean          T", "T".green().bold());
    println!("  {}  False boolean         F", "F".green().bold());
    println!("  {}  Null value            N", "N".green().bold());
    println!("  {}  Number suffixes       95K, 2.5M, 1B, 3T", "K/M/B/T".green().bold());
    println!();

    println!("{}", "Example:".yellow().bold());
    println!();
    println!("  {}", "JSON:".cyan());
    println!(
        r#"  {{
    "users": [
      {{"id": 1, "name": "Alice", "active": true}},
      {{"id": 2, "name": "Bob", "active": false}}
    ]
  }}"#
    );
    println!();
    println!("  {}", "NEON:".green());
    println!(
        r#"  users#2^id,name,active
    1 Alice T
    2 Bob F"#
    );
    println!();

    println!("{}", "Commands:".yellow().bold());
    println!();
    println!("  neon encode -i data.json -o data.neon    Encode JSON to NEON");
    println!("  neon decode -i data.neon -o data.json    Decode NEON to JSON");
    println!("  neon compare -i data.json                Compare sizes");
    println!("  neon validate -i data.neon               Validate NEON");
    println!();

    println!("{}", "More info:".yellow().bold());
    println!("  https://github.com/EwertonDaniel/-neon-neural-efficient-object-notation");
    println!();

    Ok(())
}
