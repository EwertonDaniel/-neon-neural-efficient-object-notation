/**
 * NEON Benchmark Datasets
 *
 * Reproducible test data for accurate benchmarking
 */

// =============================================================================
// Seed-based Random Generator for Reproducibility
// =============================================================================

class SeededRandom {
  private seed: number;

  constructor(seed: number = 42) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  pick<T>(arr: T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }

  bool(probability: number = 0.5): boolean {
    return this.next() < probability;
  }
}

// =============================================================================
// Name Lists for Realistic Data
// =============================================================================

const FIRST_NAMES = [
  'Alice', 'Bob', 'Carol', 'David', 'Eve', 'Frank', 'Grace', 'Henry',
  'Ivy', 'Jack', 'Kate', 'Leo', 'Mia', 'Noah', 'Olivia', 'Paul',
  'Quinn', 'Ruby', 'Sam', 'Tara', 'Uma', 'Victor', 'Wendy', 'Xander',
  'Yara', 'Zack', 'Anna', 'Ben', 'Clara', 'Dan', 'Emma', 'Finn'
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller',
  'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez',
  'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
  'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark'
];

const DEPARTMENTS = [
  'Engineering', 'Sales', 'Marketing', 'HR', 'Operations',
  'Finance', 'Legal', 'Support', 'Product', 'Design'
];

const CITIES = [
  'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix',
  'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'San Jose',
  'Austin', 'Jacksonville', 'Fort Worth', 'Columbus', 'Charlotte'
];

const COUNTRIES = ['USA', 'Canada', 'UK', 'Germany', 'France', 'Japan', 'Australia'];

const ORDER_STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];

// Reserved for future product dataset
// const PRODUCT_NAMES = [
//   'Widget Pro', 'Gadget Plus', 'Super Tool', 'Mega Device', 'Ultra Kit',
//   'Smart Sensor', 'Power Pack', 'Flex Cable', 'Quick Mount', 'Easy Clip'
// ];

// =============================================================================
// Dataset Generators
// =============================================================================

export interface Employee {
  id: number;
  name: string;
  email: string;
  department: string;
  salary: number;
  years: number;
  active: boolean;
}

export interface EmployeeDataset {
  employees: Employee[];
}

/**
 * Generate employee dataset with consistent, reproducible data
 */
export function generateEmployees(count: number, seed: number = 42): EmployeeDataset {
  const rng = new SeededRandom(seed);
  const employees: Employee[] = [];

  for (let i = 1; i <= count; i++) {
    const firstName = rng.pick(FIRST_NAMES);
    const lastName = rng.pick(LAST_NAMES);

    employees.push({
      id: i,
      name: `${firstName} ${lastName}`,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@company.com`,
      department: rng.pick(DEPARTMENTS),
      salary: rng.int(50000, 150000),
      years: rng.int(0, 20),
      active: rng.bool(0.9),
    });
  }

  return { employees };
}

export interface Order {
  id: string;
  customer: string;
  email: string;
  total: number;
  items: number;
  status: string;
  date: string;
}

export interface OrderDataset {
  orders: Order[];
}

/**
 * Generate e-commerce order dataset
 */
export function generateOrders(count: number, seed: number = 42): OrderDataset {
  const rng = new SeededRandom(seed);
  const orders: Order[] = [];

  const baseDate = new Date('2025-01-01');

  for (let i = 1; i <= count; i++) {
    const firstName = rng.pick(FIRST_NAMES);
    const lastName = rng.pick(LAST_NAMES);
    const orderDate = new Date(baseDate.getTime() + rng.int(0, 30) * 24 * 60 * 60 * 1000);

    orders.push({
      id: `ORD-${String(i).padStart(6, '0')}`,
      customer: `${firstName} ${lastName}`,
      email: `${firstName.toLowerCase()}@${rng.pick(['gmail', 'yahoo', 'outlook'])}.com`,
      total: Math.round(rng.int(1000, 500000)) / 100,
      items: rng.int(1, 10),
      status: rng.pick(ORDER_STATUSES),
      date: orderDate.toISOString().split('T')[0],
    });
  }

  return { orders };
}

export interface Metric {
  timestamp: string;
  pageViews: number;
  uniqueVisitors: number;
  bounceRate: number;
  avgSessionDuration: number;
  conversions: number;
  revenue: number;
}

export interface MetricsDataset {
  metrics: Metric[];
}

/**
 * Generate analytics metrics dataset
 */
export function generateMetrics(hours: number, seed: number = 42): MetricsDataset {
  const rng = new SeededRandom(seed);
  const metrics: Metric[] = [];

  const baseDate = new Date('2025-01-01T00:00:00Z');

  for (let i = 0; i < hours; i++) {
    const timestamp = new Date(baseDate.getTime() + i * 60 * 60 * 1000);

    metrics.push({
      timestamp: timestamp.toISOString(),
      pageViews: rng.int(1000, 10000),
      uniqueVisitors: rng.int(500, 5000),
      bounceRate: Math.round(rng.int(30, 70)) / 100,
      avgSessionDuration: rng.int(60, 300),
      conversions: rng.int(10, 100),
      revenue: Math.round(rng.int(100000, 1000000)) / 100,
    });
  }

  return { metrics };
}

export interface Repository {
  id: number;
  name: string;
  owner: string;
  description: string;
  stars: number;
  forks: number;
  language: string;
  createdAt: string;
}

export interface RepositoryDataset {
  repositories: Repository[];
}

/**
 * Generate GitHub-like repository dataset
 */
export function generateRepositories(count: number, seed: number = 42): RepositoryDataset {
  const rng = new SeededRandom(seed);
  const repositories: Repository[] = [];

  const languages = ['TypeScript', 'JavaScript', 'Python', 'Go', 'Rust', 'Java', 'C++'];
  const adjectives = ['awesome', 'super', 'mega', 'ultra', 'hyper', 'next', 'open'];
  const nouns = ['lib', 'kit', 'tools', 'utils', 'core', 'api', 'sdk', 'framework'];

  for (let i = 1; i <= count; i++) {
    const name = `${rng.pick(adjectives)}-${rng.pick(nouns)}`;
    const owner = rng.pick(FIRST_NAMES).toLowerCase();

    repositories.push({
      id: rng.int(10000000, 99999999),
      name,
      owner,
      description: `A ${rng.pick(adjectives)} ${rng.pick(nouns)} for ${rng.pick(languages)}`,
      stars: rng.int(100, 500000),
      forks: rng.int(10, 50000),
      language: rng.pick(languages),
      createdAt: new Date(rng.int(2015, 2024), rng.int(0, 11), rng.int(1, 28)).toISOString().split('T')[0],
    });
  }

  return { repositories };
}

export interface User {
  id: number;
  name: string;
  email: string;
  age: number;
  city: string;
  country: string;
  notifications: boolean;
  theme: string;
  posts: number;
  followers: number;
  following: number;
}

export interface UserDataset {
  users: User[];
}

/**
 * Generate user profile dataset with nested-like flattened structure
 */
export function generateUsers(count: number, seed: number = 42): UserDataset {
  const rng = new SeededRandom(seed);
  const users: User[] = [];

  const themes = ['dark', 'light', 'auto'];

  for (let i = 1; i <= count; i++) {
    const firstName = rng.pick(FIRST_NAMES);
    const lastName = rng.pick(LAST_NAMES);

    users.push({
      id: i,
      name: `${firstName} ${lastName}`,
      email: `${firstName.toLowerCase()}@${rng.pick(['gmail', 'yahoo', 'company'])}.com`,
      age: rng.int(18, 65),
      city: rng.pick(CITIES),
      country: rng.pick(COUNTRIES),
      notifications: rng.bool(0.7),
      theme: rng.pick(themes),
      posts: rng.int(0, 500),
      followers: rng.int(0, 10000),
      following: rng.int(0, 1000),
    });
  }

  return { users };
}

// =============================================================================
// Standard Benchmark Datasets
// =============================================================================

/**
 * Standard benchmark configurations for reproducibility
 */
export const BENCHMARK_CONFIGS = {
  small: { count: 10, seed: 42 },
  medium: { count: 100, seed: 42 },
  large: { count: 1000, seed: 42 },
  xlarge: { count: 10000, seed: 42 },
};

/**
 * Generate all standard benchmark datasets
 */
export function generateAllDatasets(config: { count: number; seed: number }) {
  return {
    employees: generateEmployees(config.count, config.seed),
    orders: generateOrders(config.count, config.seed),
    metrics: generateMetrics(config.count, config.seed),
    repositories: generateRepositories(config.count, config.seed),
    users: generateUsers(config.count, config.seed),
  };
}
