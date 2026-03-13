<script lang="ts">
    import { storage } from '$lib/appwrite';
    import Image from '../nodes/Image.svelte';

    type StoragePreviewParams = Parameters<(typeof storage)['getFilePreview']>;
    type Gravity = StoragePreviewParams[4];
    type Output = StoragePreviewParams[12];

    interface Props {
        file_id: string;
        bucket_id?: string;
        alt?: string;
        title?: string;
        width?: number;
        height?: number;
        gravity?: Gravity;
        quality?: number;
        border_width?: number;
        border_color?: string;
        border_radius?: number;
        opacity?: number;
        rotation?: number;
        background_color?: string;
        output?: Output;
        just_img?: boolean;
    }

    const {
        file_id,
        bucket_id = 'images',
        alt = '',
        title = '',
        width = 0,
        height = 0,
        gravity = 'center' as Gravity,
        quality = 90,
        border_width = 0,
        border_color = 'CDCA30',
        border_radius = 0,
        opacity = 1,
        rotation = 0,
        background_color = '000000',
        output = 'webp' as Output,
        just_img = false
    }: Props = $props();

    const src = storage
        .getFilePreview(
            bucket_id,
            file_id,
            width,
            height,
            gravity,
            quality,
            border_width,
            border_color,
            border_radius,
            opacity,
            rotation,
            background_color,
            output
        )
        .toString();
</script>

{#if just_img}
    <img {src} {alt} {title} style="margin-bottom: 2rem;" />
{:else}
    <Image {src} {alt} {title} />
{/if}
