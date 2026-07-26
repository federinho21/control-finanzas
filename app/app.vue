<template>
  <div class="app-shell">
    <AppSidebar />
    <div class="app-main">
      <NuxtPage />
    </div>
  </div>
</template>

<style>
.app-shell {
  display: flex;
  height: 100dvh;
  overflow: hidden;
  background: var(--ui-bg);
}

.app-main {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
</style>
