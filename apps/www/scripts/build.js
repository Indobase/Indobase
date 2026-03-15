import { build } from 'vite';

async function main() {
    try {
        await build();
    } catch (err) {
        console.error('Build failed:', err?.message ?? err);
        if (err?.stack) console.error(err.stack);
        process.exit(1);
    }
}

main();
