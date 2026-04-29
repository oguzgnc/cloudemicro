#!/usr/bin/env node
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const TARGET = '../target-monolith/target/classes';
const OUT_FILE = path.join(__dirname, 'dependencies.json');

function cleanName(name) {
	if (!name) return name;
	return name.replace(/\s*\(.*\)$/, '');
}

function isInternal(name) {
	return name && name.startsWith('org.mybatis.jpetstore');
}

function parseJdepsOutput(output) {
	const deps = {};
	const lines = output.split(/\r?\n/);
	for (const raw of lines) {
		const line = raw.trim();
		if (!line) continue;
		const m = line.match(/^(\S+)\s*->\s*(\S+)/);
		if (!m) continue;
		const src = cleanName(m[1]);
		const dst = cleanName(m[2]);
		if (!isInternal(src) || !isInternal(dst)) continue;
		if (!deps[src]) deps[src] = [];
		if (!deps[src].includes(dst)) deps[src].push(dst);
	}
	return deps;
}

function runJdeps() {
	return new Promise((resolve, reject) => {
		const args = ['-v', '-R', TARGET];
		const proc = spawn('jdeps', args, { cwd: __dirname });
		let out = '';
		let err = '';
		proc.stdout.on('data', d => out += d.toString());
		proc.stderr.on('data', d => err += d.toString());
		proc.on('error', e => reject(e));
		proc.on('close', code => {
			if (code !== 0) return reject(new Error(`jdeps exited ${code}: ${err}`));
			resolve(out);
		});
	});
}

async function main() {
	const arg = process.argv[2];
	let output;

	if (arg && (arg === '--help' || arg === '-h')) {
		console.log('Usage: node analyzer.js [<jdeps-output-file>]\n\nIf an input file is provided it will be parsed instead of running jdeps.');
		process.exit(0);
	}

	if (arg) {
		// If a file path is provided, parse that file (dry-run/testing)
		const filePath = path.isAbsolute(arg) ? arg : path.join(process.cwd(), arg);
		try {
			output = fs.readFileSync(filePath, 'utf8');
		} catch (e) {
			console.error('Failed to read input file:', e.message);
			process.exit(2);
		}
	} else {
		try {
			output = await runJdeps();
		} catch (e) {
			console.error('Failed to run jdeps:', e.message);
			console.error('If jdeps is not available you can pass a jdeps output file as an argument.');
			process.exit(3);
		}
	}

	const graph = parseJdepsOutput(output);
	try {
		fs.writeFileSync(OUT_FILE, JSON.stringify(graph, null, 2), 'utf8');
		console.log(`Wrote ${OUT_FILE} (${Object.keys(graph).length} nodes)`);
	} catch (e) {
		console.error('Failed to write output file:', e.message);
		process.exit(4);
	}
}

main();
