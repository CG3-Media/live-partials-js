class LivePartial {
  constructor(element) {
    this.element = element;
    this.eventHandlers = {};

    this.state = new Proxy(
      JSON.parse(element.dataset.state || '{}'),
      {
        set: (obj, prop, value) => {
          const oldValue = obj[prop];
          obj[prop] = value;
          this.emit('stateChange', { prop, value, oldValue });
          this.handleStateChange();
          return true;
        }
      }
    );

    this.emit('initialized');
  }

  on(eventName, handler) {
    this.eventHandlers[eventName] = this.eventHandlers[eventName] || [];
    this.eventHandlers[eventName].push(handler);
    return () => this.off(eventName, handler);
  }

  off(eventName, handler) {
    if (!this.eventHandlers[eventName]) return;
    this.eventHandlers[eventName] = this.eventHandlers[eventName].filter(h => h !== handler);
  }

  emit(eventName, data = {}) {
    if (!this.eventHandlers[eventName]) return;

    const eventData = {
      ...data,
      partial: this,
      element: this.element,
      partialName: this.element.dataset.partialName,
      timestamp: new Date()
    };

    this.eventHandlers[eventName].forEach(handler => handler(eventData));

    this.element.dispatchEvent(new CustomEvent(`live-partial:${eventName}`, {
      detail: eventData,
      bubbles: true
    }));
  }

  handleStateChange() {
    if (this.updateTimeout) clearTimeout(this.updateTimeout);
    this.emit('beforeDebounce', { state: this.state });

    this.updateTimeout = setTimeout(() => {
      this.sendUpdate();
    }, 100);
  }

  async sendUpdate() {
    try {
      this.emit('beforeUpdate', { state: this.state });

      const response = await fetch(`/${this.element.dataset.controllerPath}/${this.element.dataset.actionMethod}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]').content
        },
        body: JSON.stringify({
          ...this.state,
          _live_partial_name: this.element.dataset.partialName
        })
      });

      const html = await response.text();

      this.emit('beforeRender', { html, response });
      this.element.innerHTML = html;
      this.emit('afterRender', { html, response });
    } catch (error) {
      this.emit('error', { error });
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-live-partial]').forEach(element => {
    element.__livePartial = new LivePartial(element);
  });

  window.livePartial = (name) => {
    const fullPath = name.includes('/') ? name : `shared/${name}`;
    const el = document.querySelector(`[data-live-partial][data-partial-name="${fullPath}"]`);
    return el?.__livePartial;
  };
});


