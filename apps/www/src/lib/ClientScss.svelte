<!--
  Client-only SCSS loader. Importing the full scss tree here avoids SSR timeout
  because this component is only mounted in the browser.
-->
<script lang="ts">
	import '$scss/index.scss';
</script>
