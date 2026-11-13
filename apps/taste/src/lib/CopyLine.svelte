<script lang="ts">
  // A copy line shown where it would live in Messenger: a button on a card, a card title, a chat
  // preview row, a system line, an empty state, the building chip, an error, a toast.
  let { text, role }: { text: string; role: string } = $props();
</script>

<div class="ctx" data-role={role}>
  {#if role === "button"}
    <div class="card row">
      <span class="btn">{text}</span>
    </div>
  {:else if role === "title"}
    <div class="card">
      <div class="head">
        <span class="mark" aria-hidden="true"></span>
        <span class="title">{text}</span>
      </div>
    </div>
  {:else if role === "summary"}
    <div class="card preview">
      <span class="group" aria-hidden="true"><i></i><i></i></span>
      <span class="who">
        <b>Apt 4B</b>
        <span class="meta">{text}</span>
      </span>
    </div>
  {:else if role === "system"}
    <p class="sys">{text}</p>
  {:else if role === "empty"}
    <div class="card empty"><span class="meta">{text}</span></div>
  {:else if role === "building"}
    <p class="chip"><span class="dot" aria-hidden="true"></span>{text}</p>
  {:else if role === "error"}
    <div class="card err"><span>{text}</span></div>
  {:else}
    <p class="toast">{text}</p>
  {/if}
</div>

<style>
  .ctx {
    width: 100%;
    display: flex;
    justify-content: center;
    pointer-events: none;
  }
  .card {
    width: 100%;
    max-width: 360px;
    text-align: left;
    background: var(--wash);
    border-radius: 12px;
    padding: 12px;
  }
  .row {
    text-align: center;
    display: flex;
    justify-content: center;
  }
  .btn {
    display: inline-flex;
    align-items: center;
    height: 36px;
    padding: 0 16px;
    border-radius: 8px;
    background: var(--primary);
    color: var(--on-primary);
    font-weight: 600;
    max-width: 100%;
    overflow-wrap: anywhere;
    text-align: center;
    line-height: 18px;
    min-height: 36px;
    height: auto;
    padding-block: 8px;
  }
  .head {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .mark {
    flex: none;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: conic-gradient(from 200deg, #0866ff, #a033ff, #ff5c87, #0866ff);
  }
  .title {
    font-size: 17px;
    line-height: 22px;
    font-weight: 600;
  }
  .preview {
    display: flex;
    gap: 12px;
    align-items: center;
  }
  .group {
    flex: none;
    position: relative;
    width: 48px;
    height: 48px;
  }
  .group i {
    position: absolute;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: #1b7f3b;
    border: 2px solid var(--wash);
  }
  .group i:first-child {
    left: 0;
    top: 0;
    background: #7b4fd6;
  }
  .group i:last-child {
    right: 0;
    bottom: 0;
  }
  .who {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .meta {
    color: var(--secondary);
    font-size: 13px;
    line-height: 16px;
  }
  .sys {
    margin: 0;
    color: var(--secondary);
    font-size: 13px;
    line-height: 16px;
    text-align: center;
    padding: 4px 12px;
  }
  .empty {
    text-align: center !important;
    padding: 24px 12px;
  }
  .chip {
    margin: 0;
    display: inline-flex;
    gap: 8px;
    align-items: center;
    padding: 8px 14px;
    border-radius: 18px;
    background: var(--wash);
    color: var(--secondary);
    font-size: 13px;
    line-height: 16px;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--primary);
  }
  .err {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .err::before {
    content: "";
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--negative);
  }
  .err span {
    color: var(--text);
    font-size: 13px;
    line-height: 16px;
  }
  .toast {
    margin: 0;
    padding: 8px 14px;
    border-radius: 99px;
    background: var(--toast);
    color: var(--on-toast);
    font-size: 13px;
    line-height: 16px;
    font-weight: 600;
  }
</style>
