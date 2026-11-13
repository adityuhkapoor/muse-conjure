// Dense symmetric positive definite helpers on row-major Float64Array, d x d. Small d (about 100).

/** Lower Cholesky factor L with A = L Lᵀ. Adds jitter to the diagonal if needed. */
export function cholesky(A: Float64Array, d: number): Float64Array {
  for (let jitter = 0; ; jitter = jitter ? jitter * 10 : 1e-9) {
    const L = new Float64Array(d * d);
    let ok = true;
    for (let i = 0; i < d && ok; i++) {
      for (let j = 0; j <= i; j++) {
        let s = A[i * d + j]! + (i === j ? jitter : 0);
        for (let k = 0; k < j; k++) s -= L[i * d + k]! * L[j * d + k]!;
        if (i === j) {
          if (s <= 0) {
            ok = false;
            break;
          }
          L[i * d + i] = Math.sqrt(s);
        } else L[i * d + j] = s / L[j * d + j]!;
      }
    }
    if (ok) return L;
    if (jitter > 1) throw new Error("matrix is not positive definite");
  }
}

/** Solve L Lᵀ x = b. */
export function cholSolve(L: Float64Array, d: number, b: Float64Array): Float64Array {
  const y = new Float64Array(d);
  for (let i = 0; i < d; i++) {
    let s = b[i]!;
    for (let k = 0; k < i; k++) s -= L[i * d + k]! * y[k]!;
    y[i] = s / L[i * d + i]!;
  }
  const x = new Float64Array(d);
  for (let i = d - 1; i >= 0; i--) {
    let s = y[i]!;
    for (let k = i + 1; k < d; k++) s -= L[k * d + i]! * x[k]!;
    x[i] = s / L[i * d + i]!;
  }
  return x;
}

/** A⁻¹ from its Cholesky factor. */
export function cholInverse(L: Float64Array, d: number): Float64Array {
  // Linv (lower), then A⁻¹ = Linvᵀ Linv.
  const Li = new Float64Array(d * d);
  for (let i = 0; i < d; i++) {
    Li[i * d + i] = 1 / L[i * d + i]!;
    for (let j = 0; j < i; j++) {
      let s = 0;
      for (let k = j; k < i; k++) s -= L[i * d + k]! * Li[k * d + j]!;
      Li[i * d + j] = s / L[i * d + i]!;
    }
  }
  const out = new Float64Array(d * d);
  for (let i = 0; i < d; i++)
    for (let j = 0; j <= i; j++) {
      let s = 0;
      for (let k = i; k < d; k++) s += Li[k * d + i]! * Li[k * d + j]!;
      out[i * d + j] = s;
      out[j * d + i] = s;
    }
  return out;
}
