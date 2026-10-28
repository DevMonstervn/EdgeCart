import type {
  OrderStatus,
  SellerRequestStatus,
  StoreStatus,
  UserRole,
  UserStatus,
} from '@edgecart/shared';

export function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function slugifyVietnamese(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

export function getRoleDisplayLabel(role?: UserRole | string | null, isSeller?: boolean): string {
  switch (role) {
    case 'SUPER_ADMIN':
      return 'Quản trị tối cao';
    case 'PRODUCT_MANAGER':
      return 'Quản lý sản phẩm';
    case 'ORDER_OPERATOR':
      return 'Vận hành đơn hàng';
    case 'CUSTOMER':
    default:
      return isSeller ? 'Người mua • Người bán' : 'Người mua';
  }
}

export function getRoleBadgeClass(role?: UserRole | string | null, isSeller?: boolean): string {
  switch (role) {
    case 'SUPER_ADMIN':
      return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    case 'PRODUCT_MANAGER':
      return 'bg-violet-50 text-violet-700 border-violet-200';
    case 'ORDER_OPERATOR':
      return 'bg-sky-50 text-sky-700 border-sky-200';
    case 'CUSTOMER':
    default:
      return isSeller
        ? 'bg-teal-50 text-teal-700 border-teal-200'
        : 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
}

export function getOrderStatusMeta(status?: OrderStatus | string | null): { label: string; badgeClass: string } {
  switch (status) {
    case 'PENDING':
      return { label: 'Chờ xác nhận', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' };
    case 'CONFIRMED':
      return { label: 'Đã xác nhận', badgeClass: 'bg-sky-50 text-sky-700 border-sky-200' };
    case 'PROCESSING':
      return { label: 'Đang chuẩn bị', badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
    case 'SHIPPING':
      return { label: 'Đang giao hàng', badgeClass: 'bg-purple-50 text-purple-700 border-purple-200' };
    case 'DELIVERED':
      return { label: 'Giao thành công', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'CANCELLED':
      return { label: 'Đã hủy', badgeClass: 'bg-rose-50 text-rose-700 border-rose-200' };
    case 'RETURNED':
      return { label: 'Trả hàng', badgeClass: 'bg-slate-100 text-slate-700 border-slate-300' };
    default:
      return { label: status || 'Không xác định', badgeClass: 'bg-slate-50 text-slate-700 border-slate-200' };
  }
}

export function getStoreStatusMeta(status?: StoreStatus | string | null): { label: string; badgeClass: string } {
  switch (status) {
    case 'ACTIVE':
      return { label: 'Đang hoạt động', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'INACTIVE':
      return { label: 'Tạm nghỉ', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' };
    case 'SUSPENDED':
      return { label: 'Đình chỉ', badgeClass: 'bg-rose-50 text-rose-700 border-rose-200' };
    default:
      return { label: status || 'Không xác định', badgeClass: 'bg-slate-100 text-slate-600 border-slate-200' };
  }
}

export function getUserStatusMeta(status?: UserStatus | string | null): { label: string; badgeClass: string } {
  switch (status) {
    case 'ACTIVE':
      return { label: 'Hoạt động', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'INACTIVE':
      return { label: 'Tạm khóa', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' };
    case 'BANNED':
      return { label: 'Khóa vĩnh viễn', badgeClass: 'bg-rose-50 text-rose-700 border-rose-200' };
    default:
      return { label: status || 'Không xác định', badgeClass: 'bg-slate-100 text-slate-600 border-slate-200' };
  }
}

export function getSellerRequestStatusMeta(
  status?: SellerRequestStatus | string | null
): { label: string; badgeClass: string } {
  switch (status) {
    case 'PENDING':
      return { label: 'Chờ xét duyệt', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' };
    case 'APPROVED':
      return { label: 'Đã phê duyệt', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'REJECTED':
      return { label: 'Đã từ chối', badgeClass: 'bg-rose-50 text-rose-700 border-rose-200' };
    default:
      return { label: status || 'Không xác định', badgeClass: 'bg-slate-100 text-slate-600 border-slate-200' };
  }
}

export function syncUserInvalidAria(event: Event): void {
  const target = event.target as HTMLElement | null;
  if (!target || typeof target.matches !== 'function') return;
  try {
    if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && !CSS.supports('selector(:user-invalid)')) {
      return;
    }
    const invalid = target.matches(':user-invalid');
    if (event.type === 'blur' || target.hasAttribute('aria-invalid')) {
      target.setAttribute('aria-invalid', invalid ? 'true' : 'false');
    }
  } catch {
    // Ignore in non-browser/test DOM environments without :user-invalid selector support
  }
}
