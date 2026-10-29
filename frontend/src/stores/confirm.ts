import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface ConfirmOptions {
  title?: string;
  message: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'primary' | 'danger' | 'warning' | 'success';
}

export const useConfirmStore = defineStore('confirm', () => {
  const isOpen = ref(false);
  const title = ref('Xác nhận thao tác');
  const message = ref('');
  const description = ref<string | undefined>(undefined);
  const confirmText = ref('Xác nhận');
  const cancelText = ref('Hủy bỏ');
  const variant = ref<'primary' | 'danger' | 'warning' | 'success'>('primary');
  const isSubmitting = ref(false);

  let resolver: ((value: boolean) => void) | null = null;

  function ask(options: ConfirmOptions): Promise<boolean> {
    title.value = options.title || 'Xác nhận thao tác';
    message.value = options.message;
    description.value = options.description;
    confirmText.value = options.confirmText || 'Xác nhận';
    cancelText.value = options.cancelText || 'Hủy bỏ';
    variant.value = options.variant || 'primary';
    isSubmitting.value = false;
    isOpen.value = true;

    return new Promise<boolean>((resolve) => {
      resolver = resolve;
    });
  }

  function handleConfirm() {
    isOpen.value = false;
    if (resolver) {
      resolver(true);
      resolver = null;
    }
  }

  function handleCancel() {
    isOpen.value = false;
    if (resolver) {
      resolver(false);
      resolver = null;
    }
  }

  return {
    isOpen,
    title,
    message,
    description,
    confirmText,
    cancelText,
    variant,
    isSubmitting,
    ask,
    handleConfirm,
    handleCancel,
  };
});
