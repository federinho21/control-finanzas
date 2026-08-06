<template>
  <div class="app-shell">
    <AppSidebar class="hidden lg:flex" />
    <div class="app-main">
      <NuxtPage />
    </div>
    <MobileNav class="lg:hidden" />
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

@media (max-width: 1023px) {
  .app-main {
    padding-bottom: 64px;
  }
}
</style>
