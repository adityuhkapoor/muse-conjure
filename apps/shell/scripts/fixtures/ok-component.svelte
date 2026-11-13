<!-- Fixture: must PASS the token lint. Uses tokens, 0, 1px and percentages only. -->
<div class="x">ok</div>
<style>
  .x {
    color: var(--c-text);
    margin: 0;
    padding: var(--sp-8) 50%;
    border: 1px solid var(--c-divider);
    transition: opacity var(--dur-xs);
    width: calc(100% - var(--sp-16));
  }
  @media (min-width: 1100px) { .x { padding: 0; } }
</style>
