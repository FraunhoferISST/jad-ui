export function formatFileSize(bytes: number | undefined | null): string {
  if (!bytes || bytes <= 0) {
    return '0 Bytes';
  }

  const units = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, index);

  return `${Math.round(value * 100) / 100} ${units[index]}`;
}

export const DATE_FORMATS = {
  shortDate: 'dd.MM.yyyy',
  dateWithTime: 'dd.MM.yyyy HH:mm:ss',
};
