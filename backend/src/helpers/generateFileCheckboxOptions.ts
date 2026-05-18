interface FileOption {
  key: string;
  label: string;
}

interface CheckboxOption {
  text: {
    type: 'mrkdwn';
    text: string;
  };
  value: string;
}

export function generateFileCheckboxOptions(fileOptionsArray: FileOption[]): CheckboxOption[] {
  return fileOptionsArray.map((item) => ({
    text: {
      type: 'mrkdwn' as const,
      text: item.label,
    },
    value: item.key,
  }));
}
