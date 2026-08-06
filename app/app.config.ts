export default defineAppConfig({
  ui: {
    card: {
      slots: {
        root: 'overflow-visible bg-white/6 border-white/10 shadow-lg shadow-black/20 backdrop-blur-xl'
      }
    },
    button: {
      slots: {
        base: 'font-medium'
      }
    },
    input: {
      slots: {
        root: 'bg-white/5 border-white/10'
      }
    },
    select: {
      slots: {
        root: 'bg-white/5 border-white/10'
      }
    },
    textarea: {
      slots: {
        root: 'bg-white/5 border-white/10'
      }
    }
  }
})
