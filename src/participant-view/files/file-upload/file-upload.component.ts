import { CommonModule } from '@angular/common';
import { Component, EventEmitter, inject, Output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { EdcClientService, ModalAndAlertService } from '@eclipse-edc/dashboard-core';
import { ContractDefinition } from '@think-it-labs/edc-connector-client';

import { ParticipantConfigService } from '../../services/participant-config.service';
import { UploadService } from '../../services/upload.service';
import { formatFileSize } from '../../utils/format.utils';

@Component({
  selector: 'participant-file-upload',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './file-upload.component.html',
})
export class FileUploadComponent {
  private readonly fb = inject(FormBuilder);
  private readonly modalAndAlert = inject(ModalAndAlertService);
  private readonly edcClientService = inject(EdcClientService);
  private readonly uploadService = inject(UploadService);
  private readonly configService = inject(ParticipantConfigService);

  @Output() cancel = new EventEmitter<void>();
  @Output() uploaded = new EventEmitter<number>();

  readonly formatFileSize = formatFileSize;
  readonly form = this.fb.nonNullable.group({
    contractDefinitionId: ['', Validators.required],
  });

  uploadStep = 1;
  selectedFiles: File[] = [];
  contractDefinitions: ContractDefinition[] = [];
  filePreviewData: Array<{
    name: string;
    size: number;
    type: string;
  }> = [];

  uploading = false;
  loading = true;
  maxFileSize = 10 * 1024 * 1024;
  allowedFileTypes: string[] = [];

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
    if (!input.files) {
      return;
    }

    const files = Array.from(input.files);
    const tooLarge = files.find(file => file.size > this.maxFileSize);
    if (tooLarge) {
      this.modalAndAlert.showAlert(
        `File "${tooLarge.name}" exceeds max size ${formatFileSize(this.maxFileSize)}.`,
        'Upload validation',
        'error',
        8,
      );
      return;
    }

    if (this.allowedFileTypes.length > 0) {
      const invalid = files.find(file => !this.allowedFileTypes.includes(file.type));
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

    this.selectedFiles = files;
  }

  nextStep(): void {
    if (!this.canProceed()) {
      return;
    }

    if (this.uploadStep === 2) {
      this.preparePreview();
    }

    this.uploadStep += 1;
  }

  previousStep(): void {
    if (this.uploadStep > 1) {
      this.uploadStep -= 1;
    }
  }

  goToStep(step: number): void {
    if (!this.canNavigateToStep(step)) {
      return;
    }
    if (step === 3) {
      this.preparePreview();
    }
    this.uploadStep = step;
  }

  canNavigateToStep(step: number): boolean {
    if (step <= 1) {
      return true;
    }
    return this.selectedFiles.length > 0 && (step !== 3 || this.form.valid);
  }

  canProceed(): boolean {
    if (this.uploadStep === 1) {
      return this.selectedFiles.length > 0;
    }
    return this.uploadStep !== 2 || this.form.valid;
  }

  async upload(): Promise<void> {
    if (this.selectedFiles.length === 0 || this.uploading) {
      return;
    }

    const contractDefinitionId = this.form.controls.contractDefinitionId.value;
    if (!contractDefinitionId || this.form.invalid) {
      return;
    }

    this.uploading = true;
    try {
      for (const file of this.selectedFiles) {
        await this.uploadService.uploadFile(file, contractDefinitionId);
      }

      this.uploaded.emit(this.selectedFiles.length);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to upload file.';
      this.modalAndAlert.showAlert(message, 'Upload failed', 'error', 8);
    } finally {
      this.uploading = false;
    }
  }

  closeUpload(): void {
    this.cancel.emit();
  }

  getSelectedDefinition(): ContractDefinition | undefined {
    return this.contractDefinitions.find(
      definition => definition.id === this.form.controls.contractDefinitionId.value,
    );
  }

  private preparePreview(): void {
    this.filePreviewData = this.selectedFiles.map(file => ({
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
    }));
  }

  private async loadData(): Promise<void> {
    this.loading = true;
    try {
      const [definitions, uploadConfig] = await Promise.all([
        this.edcClientService.getClient().then(client => client.management.contractDefinitions.queryAll()),
        this.configService.getUploadConfig(),
      ]);

      this.contractDefinitions = definitions.sort((a, b) => a.id.localeCompare(b.id));
      this.maxFileSize = uploadConfig.maxFileSize;
      this.allowedFileTypes = uploadConfig.allowedFileTypes;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load upload metadata.';
      this.modalAndAlert.showAlert(message, 'Upload setup', 'error', 8);
    } finally {
      this.loading = false;
    }
  }
}
