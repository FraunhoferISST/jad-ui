import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, inject, ViewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ModalAndAlertService } from '@eclipse-edc/dashboard-core';

import { PartnerReference, UseCase } from '../../models/redline-data.model';
import { ParticipantConfigService } from '../../services/participant-config.service';
import { PartnerService } from '../../services/partner.service';
import { UploadService } from '../../services/upload.service';
import { UseCaseService } from '../../services/use-case.service';
import { formatFileSize } from '../../utils/format.utils';

@Component({
  selector: 'participant-file-upload',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './file-upload.component.html',
})
export class FileUploadComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly modalAndAlert = inject(ModalAndAlertService);
  private readonly useCaseService = inject(UseCaseService);
  private readonly partnerService = inject(PartnerService);
  private readonly uploadService = inject(UploadService);
  private readonly configService = inject(ParticipantConfigService);

  @ViewChild('partnerDropdown') partnerDropdown?: ElementRef<HTMLElement>;
  @ViewChild('partnerTrigger') partnerTrigger?: ElementRef<HTMLElement>;

  readonly formatFileSize = formatFileSize;

  readonly form = this.fb.nonNullable.group({
    useCase: ['', Validators.required],
    partnerIds: [[] as string[]],
  });

  uploadStep = 1;
  selectedFiles: File[] = [];
  useCases: UseCase[] = [];
  partners: PartnerReference[] = [];
  filePreviewData: Array<{
    name: string;
    size: number;
    type: string;
    useCase?: string;
    partners?: string[];
  }> = [];

  uploading = false;
  loading = true;
  partnerSearch = '';
  isPartnerDropdownOpen = false;
  maxFileSize = 10 * 1024 * 1024;
  allowedFileTypes: string[] = [];

  readonly uploadSteps = [
    { label: 'Select file', number: 1 },
    { label: 'Details', number: 2 },
    { label: 'Access', number: 3 },
    { label: 'Review', number: 4 },
  ];

  constructor() {
    void this.loadData();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isPartnerDropdownOpen) {
      return;
    }
    const target = event.target as Node | null;
    if (
      target &&
      (this.partnerDropdown?.nativeElement.contains(target) ||
        this.partnerTrigger?.nativeElement.contains(target))
    ) {
      return;
    }
    this.isPartnerDropdownOpen = false;
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

    if (this.uploadStep === 3) {
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
    if (step === 4) {
      this.preparePreview();
    }
    this.uploadStep = step;
  }

  canNavigateToStep(step: number): boolean {
    if (step <= 1) {
      return true;
    }
    return this.selectedFiles.length > 0;
  }

  canProceed(): boolean {
    if (this.uploadStep === 1) {
      return this.selectedFiles.length > 0;
    }
    if (this.uploadStep === 2) {
      return this.form.controls.useCase.valid;
    }
    return true;
  }

  async upload(): Promise<void> {
    if (this.selectedFiles.length === 0 || this.uploading) {
      return;
    }

    const useCaseId = this.form.controls.useCase.value;
    const partnerIds = this.form.controls.partnerIds.value;
    if (!useCaseId) {
      return;
    }

    this.uploading = true;
    try {
      for (const file of this.selectedFiles) {
        await this.uploadService.uploadFile(file, useCaseId, partnerIds);
      }

      this.modalAndAlert.showAlert(
        `Uploaded ${this.selectedFiles.length} file(s) successfully.`,
        'Upload complete',
        'success',
        6,
      );
      void this.router.navigate(['/files']);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to upload file.';
      this.modalAndAlert.showAlert(message, 'Upload failed', 'error', 8);
    } finally {
      this.uploading = false;
    }
  }

  closeUpload(): void {
    void this.router.navigate(['/files']);
  }

  togglePartnerDropdown(): void {
    this.isPartnerDropdownOpen = !this.isPartnerDropdownOpen;
  }

  updatePartnerSearch(value: string): void {
    this.partnerSearch = value;
  }

  getFilteredPartners(): PartnerReference[] {
    const query = this.partnerSearch.trim().toLowerCase();
    if (!query) {
      return this.partners;
    }

    return this.partners.filter(partner => {
      const nickname = (partner.nickname ?? '').toLowerCase();
      const identifier = (partner.identifier ?? '').toLowerCase();
      return nickname.includes(query) || identifier.includes(query);
    });
  }

  getSelectedPartnerIds(): string[] {
    return this.form.controls.partnerIds.value;
  }

  isPartnerSelected(partnerId: string): boolean {
    return this.getSelectedPartnerIds().includes(partnerId);
  }

  togglePartnerSelection(partnerId: string): void {
    const current = this.getSelectedPartnerIds();
    const next = current.includes(partnerId)
      ? current.filter(id => id !== partnerId)
      : [...current, partnerId];

    this.form.patchValue({ partnerIds: next });
  }

  getSelectedPartnerLabels(): string[] {
    const selected = this.getSelectedPartnerIds();
    return this.partners
      .filter(partner => selected.includes(partner.identifier))
      .map(partner => partner.nickname || partner.identifier);
  }

  private preparePreview(): void {
    const selectedUseCaseId = this.form.controls.useCase.value;
    const selectedUseCase = this.useCases.find(useCase => useCase.id === selectedUseCaseId);
    const selectedPartnerLabels = this.getSelectedPartnerLabels();

    this.filePreviewData = this.selectedFiles.map(file => ({
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
      useCase: selectedUseCase?.label,
      partners: selectedPartnerLabels.length > 0 ? selectedPartnerLabels : undefined,
    }));
  }

  private async loadData(): Promise<void> {
    this.loading = true;
    try {
      const [useCases, partners, uploadConfig] = await Promise.all([
        this.useCaseService.getUseCases(),
        this.partnerService.getPartners(),
        this.configService.getUploadConfig(),
      ]);

      this.useCases = useCases;
      this.partners = partners;
      this.maxFileSize = uploadConfig.maxFileSize;
      this.allowedFileTypes = uploadConfig.allowedFileTypes;

      const preselectedUseCase = this.route.snapshot.queryParamMap.get('useCase');
      if (preselectedUseCase && this.useCases.some(useCase => useCase.id === preselectedUseCase)) {
        this.form.patchValue({ useCase: preselectedUseCase });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load upload metadata.';
      this.modalAndAlert.showAlert(message, 'Upload setup', 'error', 8);
    } finally {
      this.loading = false;
    }
  }
}
