<script setup lang="ts">
defineProps<{
  pending: boolean
  reconnecting: boolean
}>()
</script>

<template>
  <div class="status-strip">
    <Transition name="fade">
      <div v-if="pending" class="thinking">
        <span class="dot" />
        <span class="dot" />
        <span class="dot" />
        <span class="thinking-label">Thinking…</span>
      </div>
    </Transition>

    <Transition name="fade">
      <UAlert
        v-if="reconnecting"
        class="reconnect-alert"
        color="warning"
        variant="soft"
        title="Reconnecting..."
        icon="i-lucide-wifi-off"
      />
    </Transition>
  </div>
</template>

<style scoped>
.status-strip {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  min-height: 28px;
}

.thinking {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  background: var(--ui-bg-elevated);
  border: 1px solid var(--ui-border);
  border-radius: 20px;
  font-size: 0.78rem;
  color: var(--ui-text-muted);
}

.thinking-label {
  margin-left: 2px;
  font-style: italic;
  letter-spacing: 0.01em;
}

.dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ui-color-primary-500, #3b82f6);
  animation: bounce 1.2s infinite ease-in-out;
}

.dot:nth-child(1) { animation-delay: 0s; }
.dot:nth-child(2) { animation-delay: 0.2s; }
.dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
  40%            { transform: translateY(-5px); opacity: 1; }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 200ms ease, transform 200ms ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.reconnect-alert {
  padding: 0;
}
</style>
