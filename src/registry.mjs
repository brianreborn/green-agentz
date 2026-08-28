import { fileExists } from './util.mjs';
import { ValidationError } from './errors.mjs';

export class AgentRegistry {
  constructor(manifest) {
    this.manifest = manifest;
    this.agents = new Map(manifest.agents.map((agent) => [agent.alias, agent]));
    this.availability = new Map();
  }

  async inspect() {
    for (const agent of this.agents.values()) {
      const missing = [];
      if (agent.runtime !== 'logical') {
        const runtime = this.manifest.runtimes[agent.runtime];
        if (!(await fileExists(runtime.command))) missing.push(`runtime:${runtime.command}`);
      }
      for (const field of agent.required_artifacts ?? []) {
        if (!(await fileExists(agent[field]))) missing.push(`${field}:${agent[field] ?? '<unset>'}`);
      }
      this.availability.set(agent.alias, {
        state: missing.length ? 'unavailable' : agent.runtime === 'logical' ? 'ready' : 'cold',
        missing,
      });
    }
    return this;
  }

  get(alias) {
    const agent = this.agents.get(alias);
    if (!agent) throw new ValidationError(`Unknown agent alias: ${alias}`, { allowed: [...this.agents.keys()] });
    return agent;
  }

  status(alias) {
    return this.availability.get(alias) ?? { state: 'unknown', missing: [] };
  }

  setStatus(alias, state, extra = {}) {
    this.availability.set(alias, { ...this.status(alias), state, ...extra });
  }

  listModels() {
    return [...this.agents.values()].map((agent) => {
      const status = this.status(agent.alias);
      return {
        id: agent.alias,
        object: 'model',
        owned_by: 'green-roomz',
        native_capabilities: agent.native_capabilities,
        gateway_accepted_capabilities: agent.gateway_accepted_capabilities,
        routing_behavior: ['vision-layout-agent', 'audio-transcription-agent'].includes(agent.alias) ? 'modality_override' : 'explicit',
        availability: status.state,
        unavailable_reasons: status.missing,
        experimental_features: agent.experimental ?? [],
      };
    });
  }
}
