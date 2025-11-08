/* =========================
   ID操作ユーティリティ
   ========================= */

   export function parseZettelId(id: string): string[] {
	return id.trim().split('.').map(s => s.trim()).filter(Boolean);
  }
  
  export function compareZettelSegments(a: string[], b: string[]): number {
	const len = Math.max(a.length, b.length);
	for (let i = 0; i < len; i++) {
	  const A = a[i], B = b[i];
	  if (A === undefined) return -1;
	  if (B === undefined) return 1;
	  const nA = /^\d+$/.test(A), nB = /^\d+$/.test(B);
	  if (nA && nB) {
		const d = parseInt(A, 10) - parseInt(B, 10);
		if (d) return d;
	  } else if (!nA && !nB) {
		const d = A.toLowerCase().localeCompare(B.toLowerCase());
		if (d) return d;
	  } else {
		return nA ? -1 : 1;
	  }
	}
	return 0;
  }
  
  export function incrementSegment(seg: string): string {
	if (/^\d+$/.test(seg)) return String(parseInt(seg, 10) + 1);
	const isUpper = seg === seg.toUpperCase();
	const letters = seg.toLowerCase().split('');
	let carry = 1;
	for (let i = letters.length - 1; i >= 0; i--) {
	  if (!carry) break;
	  const code = letters[i].charCodeAt(0) - 97 + carry;
	  letters[i] = String.fromCharCode((code % 26) + 97);
	  carry = Math.floor(code / 26);
	}
	if (carry > 0) letters.unshift(String.fromCharCode(96 + carry));
	const out = letters.join('');
	return isUpper ? out.toUpperCase() : out;
  }
  
  export const isNumeric = (s: string) => /^\d+$/.test(s);
  export const isAlpha = (s: string) => /^[A-Za-z]+$/.test(s);
