import { enhancedImages } from '@sveltejs/enhanced-img';
import { sveltekit } from '@sveltejs/kit/vite';
import dynamicImport from 'vite-plugin-dynamic-import';
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer';
import manifestSRI from 'vite-plugin-manifest-sri';
import { defineConfig } from 'vitest/config';
// import { sentrySvelteKit } from '@sentry/sveltekit';

const enableImageOptimizer = process.env.ENABLE_IMAGE_OPTIMIZER === 'true';
const isProd = process.env.NODE_ENV === 'production';

export default defineConfig({
    plugins: [
        // sentrySvelteKit({
        //     sourceMapsUploadOptions: {
        //         org: 'appwrite',
        //         project: 'website'
        //     }
        // }),
        enhancedImages(),
        sveltekit(),
        dynamicImport({
            filter(id) {
                if (id.includes('/node_modules/@appwrite.io/repo/docs')) {
                    return true;
                }
            }
        }),
        ...(enableImageOptimizer
            ? [
                  ViteImageOptimizer({
                      include: ['**/*.png', '**/*.jpg', '**/*.jpeg', '**/*.gif', '**/*.svg'],
                      exclude: ['**/*.avif', '**/*.webp'],
                      cache: true,
                      cacheLocation: '.cache'
                  })
              ]
            : []),
        manifestSRI({
            algorithms: ['sha384']
        })
    ],
    css: {
        devSourcemap: !isProd
    },
    build: {
        sourcemap: false,
        reportCompressedSize: false
    },
    test: {
        include: ['src/**/*.{test,spec}.{js,ts}']
    },
    experimental: {
        enableNativePlugin: true
    }
});
