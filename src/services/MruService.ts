import type { Plugin } from 'obsidian';

interface MruData {
	version: 1;
	scopes: Record<string, string[]>; // keyed by folderFilter, most-recent-first
}

const MAX_ENTRIES = 20;
const DEFAULT_DATA: MruData = { version: 1, scopes: {} };

/**
 * Tracks most-recently-used relation selections per folder scope.
 * Persists to plugin data.json via Obsidian's loadData/saveData.
 */
export class MruService {
	private plugin: Plugin;
	private data: MruData = DEFAULT_DATA;

	constructor(plugin: Plugin) {
		this.plugin = plugin;
	}

	async load(): Promise<void> {
		const raw = await this.plugin.loadData();
		if (raw?.version === 1 && raw.scopes) {
			this.data = raw as MruData;
		}
	}

	getRecent(scope: string): string[] {
		return this.data.scopes[scope] ?? [];
	}

	recordSelection(scope: string, notePath: string): void {
		const list = this.data.scopes[scope] ?? [];
		// Remove existing entry, prepend, cap at MAX_ENTRIES
		const filtered = list.filter(p => p !== notePath);
		filtered.unshift(notePath);
		this.data.scopes[scope] = filtered.slice(0, MAX_ENTRIES);
		// Fire-and-forget persist
		this.plugin.saveData(this.data);
	}
}
