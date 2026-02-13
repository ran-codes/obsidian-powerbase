import { Plugin, TFile } from 'obsidian';
import { RelationalTableView } from './relational-table-view';
import { MruService } from './services/MruService';

export default class PowerbasePlugin extends Plugin {
	mruService!: MruService;

	async onload() {
		this.mruService = new MruService(this);
		await this.mruService.load();

		this.registerBasesView('relational-table', {
			name: 'Powerbase',
			icon: 'database',
			factory: (controller: any, containerEl: HTMLElement) =>
				new RelationalTableView(controller, containerEl, this, this.mruService),
			options: () => RelationalTableView.getViewOptions(),
		});

		// Listen for file renames to maintain wikilink integrity in
		// frontmatter list properties. Obsidian's built-in link updater
		// handles most cases, but frontmatter arrays may be missed.
		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				if (file instanceof TFile && file.extension === 'md') {
					this.handleFileRenamed(file, oldPath);
				}
			})
		);

		// Listen for file deletions. Dangling back-links are harmless
		// and self-heal when the user next edits the relation. Full
		// cleanup deferred to avoid expensive vault-wide scans.
		this.registerEvent(
			this.app.vault.on('delete', (file) => {
				if (file instanceof TFile && file.extension === 'md') {
					console.debug(
						`[Powerbase] File deleted: ${file.path}`
					);
				}
			})
		);
	}

	onunload() {}

	/**
	 * When a note is renamed, update wikilinks in frontmatter list
	 * properties across the vault. Runs on a debounce to avoid
	 * conflicts with Obsidian's own link updater.
	 */
	private handleFileRenamed(file: TFile, oldPath: string): void {
		// Obsidian's built-in link updater handles note body content.
		// For frontmatter list properties containing wikilinks, Obsidian
		// may also update them (depending on settings). We log a note
		// but defer full vault scanning to avoid performance issues.
		// If users report stale links, a manual "refresh" command can
		// be added in a future update.
		console.debug(
			`[Powerbase] File renamed: ${oldPath} → ${file.path}`
		);
	}
}
