<script lang="ts">
    import { Main } from '$lib/layouts';
    import Head from '$lib/components/meta/head.svelte';
    import { MainFooter } from '$lib/components';
    import Pricing from '$routes/(marketing)/(components)/pricing.svelte';
</script>

<Head title="Indobase Pricing" />

<Main>
    <Pricing />
</Main>

<div class="container">
    <MainFooter />
</div>

