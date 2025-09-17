struct Keys { data: array<u32>, }
struct Params { j: u32, k: u32, n: u32, _pad: u32 }
@group(0) @binding(0) var<storage, read_write> keys: Keys;
@group(0) @binding(1) var<storage, read_write> idx: Keys;
@group(0) @binding(2) var<uniform> SP: Params;

@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
	let i = gid.x;
	if (i >= SP.n) { return; }
	let j = SP.j; let k = SP.k;
	let ixj = i ^ j;
	if (ixj > i && ixj < SP.n) {
		let asc = (i & k) == 0u;
		let key_i = keys.data[i];
		let key_ixj = keys.data[ixj];
		let swap = select((key_i < key_ixj), (key_i > key_ixj), asc);
		if (swap) {
			let tmpK = key_i;
			keys.data[i] = key_ixj;
			keys.data[ixj] = tmpK;
			let tmpI = idx.data[i];
			idx.data[i] = idx.data[ixj];
			idx.data[ixj] = tmpI;
		}
	}
}