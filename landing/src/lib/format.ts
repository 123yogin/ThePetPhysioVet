/** Zero-pad to two digits: 3 -> "03". */
export const pad2 = (n: number) => String(n).padStart(2, '0');

/** Indian-grouped rupee amount: 100000 -> "₹1,00,000". */
export const rupee = (n: number) => `₹${n.toLocaleString('en-IN')}`;
