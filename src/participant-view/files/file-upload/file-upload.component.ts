import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { EdcClientService, ModalAndAlertService } from '@eclipse-edc/dashboard-core';
import { ContractDefinition } from '@think-it-labs/edc-connector-client';
import { ContractSharingService } from '../../services/contract-sharing.service';
import { ParticipantConfigService } from '../../services/participant-config.service';
import { UploadService } from '../../services/upload.service';
import { formatFileSize } from '../../utils/format.utils';
import { ContractSharing } from '../../utils/contract-sharing';

@Component({
  selector: 'app-participant-file-upload',
  imports: [NgTemplateOutlet, ReactiveFormsModule],
  templateUrl: './file-upload.component.html',
  host: { class: 'block min-w-0 max-w-full' },
})
export class FileUploadComponent {
  private readonly fb = inject(FormBuilder);
  private readonly modalAndAlert = inject(ModalAndAlertService);
  private readonly edcClientService = inject(EdcClientService);
  private readonly uploadService = inject(UploadService);
  private readonly configService = inject(ParticipantConfigService);
  private readonly sharingService = inject(ContractSharingService);

  readonly cancel = output<void>();
  readonly uploaded = output<number>();
  readonly formatFileSize = formatFileSize;
  readonly form = this.fb.nonNullable.group({ contractDefinitionId: ['', Validators.required] });
  private readonly selectedDefinitionId = toSignal(
    this.form.controls.contractDefinitionId.valueChanges,
    {
      initialValue: this.form.controls.contractDefinitionId.value,
    },
  );
  readonly uploadStep = signal(1);
  readonly selectedFiles = signal<File[]>([]);
  readonly contractDefinitions = signal<ContractDefinition[]>([]);
  readonly contractSharing = signal<ReadonlyMap<string, ContractSharing>>(new Map());
  readonly filePreviewData = computed(() =>
    this.selectedFiles().map((file) => ({
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
    })),
  );
  readonly selectedDefinition = computed(() =>
    this.contractDefinitions().find((definition) => definition.id === this.selectedDefinitionId()),
  );
  readonly uploading = signal(false);
  readonly loading = signal(true);
  readonly maxFileSize = signal(0);
  readonly allowedFileTypes = signal<string[]>([]);
  readonly uploadSteps = [
    { label: 'Select file', number: 1 },
    { label: 'Contract definition', number: 2 },
    { label: 'Review', number: 3 },
  ];

  constructor() {
    void this.loadData();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files) return;
    const files = Array.from(input.files);
    const tooLarge = files.find((file) => file.size > this.maxFileSize());
    if (tooLarge) {
      this.modalAndAlert.showAlert(
        `File "${tooLarge.name}" exceeds max size ${formatFileSize(this.maxFileSize())}.`,
        'Upload validation',
        'error',
        8,
      );
      return;
    }
    const allowed = this.allowedFileTypes();
    if (allowed.length) {
      const invalid = files.find((file) => !allowed.includes(file.type));
      if (invalid) {
        this.modalAndAlert.showAlert(
          `File "${invalid.name}" has unsupported type ${invalid.type || 'unknown'}.`,
          'Upload validation',
          'error',
          8,
        );
        return;
      }
    }
    this.selectedFiles.set(files);
  }

  nextStep(): void {
    if (this.canProceed()) this.uploadStep.update((step) => step + 1);
  }
  previousStep(): void {
    if (this.uploadStep() > 1) this.uploadStep.update((step) => step - 1);
  }
  canProceed(): boolean {
    return this.uploadStep() === 1
      ? this.selectedFiles().length > 0
      : this.uploadStep() !== 2 || this.form.valid;
  }

  async upload(): Promise<void> {
    const files = this.selectedFiles();
    if (!files.length || this.uploading()) return;
    const contractDefinitionId = this.form.controls.contractDefinitionId.value;
    if (!contractDefinitionId || this.form.invalid) return;
    this.uploading.set(true);
    try {
      for (const file of files) await this.uploadService.uploadFile(file, contractDefinitionId);
      this.uploaded.emit(files.length);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to upload file.';
      this.modalAndAlert.showAlert(message, 'Upload failed', 'error', 8);
    } finally {
      this.uploading.set(false);
    }
  }

  closeUpload(): void {
    this.cancel.emit();
  }

  private async loadData(): Promise<void> {
    this.loading.set(true);
    try {
      const uploadConfig = await this.configService.getUploadConfig();
      this.maxFileSize.set(uploadConfig.maxFileSize);
      this.allowedFileTypes.set(uploadConfig.allowedFileTypes);
      const client = await this.edcClientService.getClient();
      const definitions = await client.management.contractDefinitions.queryAll();
      this.contractSharing.set(await this.sharingService.getSharing(definitions));
      this.contractDefinitions.set(definitions.sort((a, b) => a.id.localeCompare(b.id)));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load upload metadata.';
      this.modalAndAlert.showAlert(message, 'Upload setup', 'error', 8);
    } finally {
      this.loading.set(false);
    }
  }
}
