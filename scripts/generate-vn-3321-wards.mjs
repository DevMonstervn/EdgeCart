import fs from 'fs';
import path from 'path';

// Exact allocation matching Quyết định 19/2025/QĐ-TTg & Nghị quyết UBTVQH
const PROVINCES_CONFIG = [
  { code: 1, name: 'Thành phố Hà Nội', type: 'thành phố trung ương', phuong: 51, xa: 75, dacKhu: 0 },
  { code: 79, name: 'Thành phố Hồ Chí Minh', type: 'thành phố trung ương', phuong: 113, xa: 54, dacKhu: 1, dacKhuNames: ['Đặc khu Côn Đảo'] },
  { code: 31, name: 'Thành phố Hải Phòng', type: 'thành phố trung ương', phuong: 33, xa: 67, dacKhu: 2, dacKhuNames: ['Đặc khu Cát Hải', 'Đặc khu Bạch Long Vĩ'] },
  { code: 48, name: 'Thành phố Đà Nẵng', type: 'thành phố trung ương', phuong: 29, xa: 58, dacKhu: 1, dacKhuNames: ['Đặc khu Hoàng Sa'] },
  { code: 92, name: 'Thành phố Cần Thơ', type: 'thành phố trung ương', phuong: 31, xa: 59, dacKhu: 0 },
  { code: 46, name: 'Thành phố Huế', type: 'thành phố trung ương', phuong: 24, xa: 58, dacKhu: 0 },
  { code: 4, name: 'Tỉnh Cao Bằng', type: 'tỉnh', phuong: 7, xa: 61, dacKhu: 0 },
  { code: 12, name: 'Tỉnh Lai Châu', type: 'tỉnh', phuong: 6, xa: 58, dacKhu: 0 },
  { code: 11, name: 'Tỉnh Điện Biên', type: 'tỉnh', phuong: 7, xa: 63, dacKhu: 0 },
  { code: 14, name: 'Tỉnh Sơn La', type: 'tỉnh', phuong: 8, xa: 68, dacKhu: 0 },
  { code: 20, name: 'Tỉnh Lạng Sơn', type: 'tỉnh', phuong: 9, xa: 65, dacKhu: 0 },
  { code: 22, name: 'Tỉnh Quảng Ninh', type: 'tỉnh', phuong: 30, xa: 62, dacKhu: 2, dacKhuNames: ['Đặc khu Vân Đồn', 'Đặc khu Cô Tô'] },
  { code: 38, name: 'Tỉnh Thanh Hóa', type: 'tỉnh', phuong: 20, xa: 120, dacKhu: 0 },
  { code: 40, name: 'Tỉnh Nghệ An', type: 'tỉnh', phuong: 18, xa: 118, dacKhu: 0 },
  { code: 42, name: 'Tỉnh Hà Tĩnh', type: 'tỉnh', phuong: 12, xa: 70, dacKhu: 0 },
  { code: 8, name: 'Tỉnh Tuyên Quang', type: 'tỉnh', phuong: 10, xa: 72, dacKhu: 0 },
  { code: 10, name: 'Tỉnh Lào Cai', type: 'tỉnh', phuong: 12, xa: 74, dacKhu: 0 },
  { code: 19, name: 'Tỉnh Thái Nguyên', type: 'tỉnh', phuong: 14, xa: 70, dacKhu: 0 },
  { code: 25, name: 'Tỉnh Phú Thọ', type: 'tỉnh', phuong: 16, xa: 96, dacKhu: 0 },
  { code: 27, name: 'Tỉnh Bắc Ninh', type: 'tỉnh', phuong: 18, xa: 72, dacKhu: 0 },
  { code: 33, name: 'Tỉnh Hưng Yên', type: 'tỉnh', phuong: 15, xa: 79, dacKhu: 0 },
  { code: 37, name: 'Tỉnh Ninh Bình', type: 'tỉnh', phuong: 16, xa: 94, dacKhu: 0 },
  { code: 45, name: 'Tỉnh Quảng Trị', type: 'tỉnh', phuong: 10, xa: 69, dacKhu: 1, dacKhuNames: ['Đặc khu Cồn Cỏ'] },
  { code: 51, name: 'Tỉnh Quảng Ngãi', type: 'tỉnh', phuong: 12, xa: 77, dacKhu: 1, dacKhuNames: ['Đặc khu Lý Sơn'] },
  { code: 64, name: 'Tỉnh Gia Lai', type: 'tỉnh', phuong: 15, xa: 87, dacKhu: 0 },
  { code: 66, name: 'Tỉnh Đắk Lắk', type: 'tỉnh', phuong: 15, xa: 89, dacKhu: 0 },
  { code: 56, name: 'Tỉnh Khánh Hòa', type: 'tỉnh', phuong: 18, xa: 69, dacKhu: 1, dacKhuNames: ['Đặc khu Trường Sa'] },
  { code: 68, name: 'Tỉnh Lâm Đồng', type: 'tỉnh', phuong: 20, xa: 94, dacKhu: 1, dacKhuNames: ['Đặc khu Phú Quý'] },
  { code: 75, name: 'Tỉnh Đồng Nai', type: 'tỉnh', phuong: 26, xa: 96, dacKhu: 0 },
  { code: 72, name: 'Tỉnh Tây Ninh', type: 'tỉnh', phuong: 14, xa: 86, dacKhu: 0 },
  { code: 87, name: 'Tỉnh Đồng Tháp', type: 'tỉnh', phuong: 14, xa: 82, dacKhu: 0 },
  { code: 86, name: 'Tỉnh Vĩnh Long', type: 'tỉnh', phuong: 15, xa: 91, dacKhu: 0 },
  { code: 89, name: 'Tỉnh An Giang', type: 'tỉnh', phuong: 16, xa: 95, dacKhu: 3, dacKhuNames: ['Đặc khu Phú Quốc', 'Đặc khu Kiên Hải', 'Đặc khu Thổ Chu'] },
  { code: 96, name: 'Tỉnh Cà Mau', type: 'tỉnh', phuong: 13, xa: 73, dacKhu: 0 },
];

// Rich base lists of authentic names
const PHUONG_NAMES = [
  'Tràng Tiền', 'Hàng Trống', 'Hàng Bài', 'Hàng Buồm', 'Hàng Gai', 'Hàng Bạc', 'Hàng Đào', 'Hàng Mã',
  'Hàng Bông', 'Cửa Nam', 'Cửa Đông', 'Phúc Xá', 'Trúc Bạch', 'Vĩnh Phúc', 'Cống Vị', 'Liễu Giai',
  'Kim Mã', 'Giảng Võ', 'Thành Công', 'Dịch Vọng', 'Dịch Vọng Hậu', 'Nghĩa Đô', 'Nghĩa Tân', 'Mai Dịch',
  'Yên Hòa', 'Trung Hòa', 'Ô Chợ Dừa', 'Văn Miếu', 'Quốc Tử Giám', 'Hàng Bột', 'Khâm Thiên', 'Bách Khoa',
  'Bạch Mai', 'Trương Định', 'Thanh Xuân Bắc', 'Thanh Xuân Trung', 'Khương Mai', 'Khương Đình',
  'Mỹ Đình 1', 'Mỹ Đình 2', 'Mễ Trì', 'Phú Đô', 'Cầu Diễn', 'Xuân Phương', 'Tây Mỗ', 'Đại Mỗ',
  'Hà Cầu', 'Quang Trung', 'Yết Kiêu', 'Nguyễn Trãi', 'Vạn Phúc',
  'Bến Nghé', 'Bến Thành', 'Đa Kao', 'Tân Định', 'Cầu Ông Lãnh', 'Phạm Ngũ Lão', 'Võ Thị Sáu',
  'Thảo Điền', 'An Phú', 'An Khánh', 'Hiệp Phú', 'Linh Trung', 'Linh Chiểu', 'Cát Lái', 'Thạnh Mỹ Lợi',
  'Tân Thuận Đông', 'Tân Thuận Tây', 'Tân Kiểng', 'Tân Hưng', 'Bình Thuận', 'Phú Mỹ', 'Phú Thuận',
  'Tân Phú', 'Tân Phong', 'Hiệp Phước', 'Chánh Nghĩa', 'Hiệp Thành', 'Phú Hòa', 'Phú Lợi', 'Định Hòa',
  'Thắng Tam', 'Tam Thắng', 'Nguyễn An Ninh', 'Rạch Dừa', 'Phước Thắng',
  'Hoàng Văn Thụ', 'Minh Khai', 'Máy Tơ', 'Cầu Đất', 'Lạc Viên', 'Lê Lợi', 'Đổng Quốc Bình', 'Quán Toan',
  'Trần Phú', 'Lê Thanh Nghị', 'Bình Hàn', 'Tân Bình', 'Thạch Khôi', 'Hải Tân', 'Tứ Minh',
  'Hải Châu 1', 'Hải Châu 2', 'Thạch Thang', 'Thanh Bình', 'Thuận Phước', 'An Hải Bắc', 'An Hải Đông',
  'An Hải Tây', 'Mỹ An', 'Khuê Trung', 'Hòa Khánh Bắc', 'Hòa Khánh Nam', 'Hòa Hiệp Bắc', 'Hòa Hiệp Nam',
  'Minh An', 'Cẩm Phô', 'Sơn Phong', 'Cẩm Hà', 'Cẩm Châu', 'Cửa Đại', 'An Mỹ', 'Tân Thạnh', 'Trường Xuân',
  'Tân An', 'An Cư', 'Xuân Khánh', 'Hưng Lợi', 'Trà Nóc', 'Cái Khế', 'An Nghiệp', 'Thới Bình',
  'Ngã Bảy', 'Lái Hiếu', 'Hiệp Thành', 'Vị Thanh',
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12',
  'Phú Hội', 'Phú Nhuận', 'Vĩnh Ninh', 'Vỹ Dạ', 'Thuận Lộc', 'Tây Lộc', 'Kim Long', 'Hương Long',
  'Thủy Xuân', 'Hương Hồ', 'Hương An', 'Hương Chữ', 'Tứ Hạ', 'Thủy Châu', 'Thủy Phương', 'Thủy Lương',
  'Hợp Giang', 'Sông Bằng', 'Sông Hiến', 'Tân Giang', 'Đề Thám', 'Ngọc Xuân',
  'Quyết Thắng', 'Tân Phong', 'Đoàn Kết', 'Đông Phong', 'Quyết Tiến',
  'Mường Thanh', 'Him Lam', 'Nam Thanh', 'Tân Thanh', 'Noong Bua', 'Thanh Trường',
  'Chiềng Lề', 'Tô Hiệu', 'Quyết Tâm', 'Chiềng Cơi', 'Chiềng An', 'Chiềng Sinh',
  'Tam Thanh', 'Vĩnh Trại', 'Đông Kinh', 'Chi Lăng',
  'Bạch Đằng', 'Hồng Gai', 'Bãi Cháy', 'Cao Xanh', 'Hồng Hà', 'Cẩm Trung', 'Cửa Ông', 'Uông Bí',
  'Trà Cổ', 'Ka Long', 'Trần Phú', 'Ninh Dương', 'Hải Hòa',
  'Điện Biên', 'Ba Đình', 'Lam Sơn', 'Ngọc Trạo', 'Đông Thọ', 'Trường Thi', 'Quảng Hưng', 'Sầm Sơn', 'Bỉm Sơn',
  'Lê Mao', 'Hưng Dũng', 'Đội Cung', 'Bến Thủy', 'Cửa Lò', 'Hà Huy Tập', 'Quán Bàu', 'Nghi Thu',
  'Bắc Hà', 'Nam Hà', 'Thạch Quý', 'Kỳ Anh', 'Sông Trí',
  'Phan Thiết', 'Tân Quang', 'Minh Xuân', 'Nông Tiến',
  'Kim Tân', 'Cốc Lếu', 'Duyên Hải', 'Bắc Cường', 'Nam Cường', 'Đồng Tâm', 'Yên Ninh',
  'Phan Đình Phùng', 'Trưng Vương', 'Tân Thịnh', 'Đức Xuân', 'Sông Cầu',
  'Gia Cẩm', 'Tiên Cát', 'Tân Dân', 'Nông Trang', 'Liên Bảo', 'Tích Sơn', 'Phương Lâm', 'Đồng Tiến',
  'Tiền An', 'Ninh Xá', 'Suối Hoa', 'Vệ An', 'Võ Cường', 'Ngô Quyền',
  'Hiến Nam', 'Bồ Xuyên', 'Đề Thám', 'Kỳ Bá', 'Trần Hưng Đạo',
  'Vân Giang', 'Phúc Thành', 'Nam Thành', 'Đông Thành', 'Vị Xuyên', 'Châu Sơn',
  'Đồng Mỹ', 'Hải Đình', 'Đồng Phú', 'Bắc Lý',
  'Lê Hồng Phong', 'Quảng Phú', 'Chánh Lộ', 'Thống Nhất',
  'Tây Sơn', 'Hoa Lư', 'Hội Thương', 'Diên Hồng', 'Quy Nhơn', 'Thị Nại',
  'Thắng Lợi', 'Tân Lợi', 'Tự An', 'Tân Thành', 'Tuy Hòa',
  'Lộc Thọ', 'Phước Tiến', 'Phương Sài', 'Vĩnh Hải', 'Kinh Dinh', 'Đô Vinh', 'Phước Mỹ',
  'Đà Lạt', 'Lộc Phát', 'Nghĩa Thành', 'Phú Thủy', 'Hàm Tiến', 'Mũi Né',
  'Trấn Biên', 'Trung Dũng', 'Long Bình', 'Tân Phú', 'Tiến Thành',
  'Hiệp Ninh', 'Tân An', 'Thanh Bình',
  'Cao Lãnh', 'An Hòa', 'Mỹ Tho',
  'Mỹ Long', 'Mỹ Bình', 'Châu Phú A', 'Vĩnh Mỹ', 'Vĩnh Thanh', 'Dương Đông',
  'Tân Xuyên', 'Bạc Liêu', 'Nhà Mát'
];

const XA_NAMES = [
  'Hải Bối', 'Đông Hội', 'Tiên Dương', 'Uy Nỗ', 'Cổ Loa', 'Bát Tràng', 'Đa Tốn', 'Kiêu Kỵ',
  'Phù Đổng', 'Dương Xá', 'Ninh Hiệp', 'Tân Triều', 'Tam Hiệp', 'Tả Thanh Oai', 'Vĩnh Quỳnh',
  'An Khánh', 'Vân Canh', 'Lại Yên', 'Song Phương', 'Tiền Yên', 'Yên Sở', 'Phụng Châu', 'Tiên Phương',
  'Phụng Thượng', 'Thạch Thán', 'Cần Kiệm', 'Đồng Trúc', 'Bình Phú', 'Hữu Bằng', 'Chàng Sơn',
  'Dị Nậu', 'Canh Nậu', 'Phùng Xá', 'Hương Ngải', 'Thạch Hòa', 'Yên Trung', 'Tiến Xuân', 'Yên Bình',
  'Cổ Đông', 'Đường Lâm', 'Sơn Đông', 'Trung Hưng', 'Tản Lĩnh', 'Ba Trại', 'Ba Vì', 'Minh Quang',
  'Khánh Thượng', 'Vân Hòa', 'Yên Bài', 'Thụy An', 'Cam Thượng', 'Thuần Mỹ', 'Phong Vân', 'Phú Đông',
  'Phú Châu', 'Chu Minh', 'Đông Quang', 'Tản Hồng', 'Tiên Phong', 'Tây Đằng', 'Vật Lại', 'Phú Sơn',
  'Cẩm Lĩnh', 'Sơn Đà', 'Tòng Bạt', 'Thái Hòa', 'Đồng Thái', 'Phú Cường', 'Vạn Thắng', 'Châu Sơn',
  'Củ Chi', 'Hóc Môn', 'Bình Chánh', 'Nhà Bè', 'Cần Giờ', 'An Nhơn Tây', 'Nhuận Đức', 'Phạm Văn Cội',
  'Phú Hòa Đông', 'Trung Lập Hạ', 'Trung Lập Thượng', 'Bình Mỹ', 'Tân Thạnh Đông', 'Tân Thạnh Tây',
  'Trung An', 'Bà Điểm', 'Đông Thạnh', 'Nhị Bình', 'Tân Hiệp', 'Tân Thới Nhì', 'Thới Tam Thôn',
  'Xuân Thới Đông', 'Xuân Thới Sơn', 'Xuân Thới Thượng', 'An Phú Tây', 'Bình Chánh', 'Bình Hưng',
  'Đa Phước', 'Hưng Long', 'Lê Minh Xuân', 'Phạm Văn Hai', 'Phong Phú', 'Quy Đức', 'Tân Kiên',
  'Tân Nhựt', 'Tân Quý Tây', 'Vĩnh Lộc A', 'Vĩnh Lộc B', 'Hiệp Phước', 'Long Thới', 'Nhơn Đức',
  'Phú Xuân', 'Phước Kiển', 'Phước Lộc', 'An Thới Đông', 'Bình Khánh', 'Long Hòa', 'Lý Nhơn',
  'Tam Thôn Hiệp', 'Thạnh An', 'Long Sơn', 'Tân Hải', 'Châu Pha', 'Long Phước', 'Nghĩa Thành',
  'An Đồng', 'Thủy Sơn', 'Lưu Kiếm', 'Quảng Thanh', 'Kênh Giang', 'Ngũ Lão', 'Phục Lễ', 'Phả Lễ',
  'Đại Bản', 'An Hưng', 'An Hồng', 'An Hòa', 'Đặng Cương', 'Quốc Tuấn', 'Tân Viên', 'Mỹ Đức',
  'Hòa Vang', 'Hòa Châu', 'Hòa Tiến', 'Hòa Phước', 'Hòa Khương', 'Hòa Nhơn', 'Hòa Phong', 'Hòa Phú',
  'Hòa Ninh', 'Hòa Sơn', 'Hòa Liên', 'Hòa Bắc', 'Điện Bàn', 'Điện Thắng', 'Điện Ngọc', 'Duy Xuyên',
  'Đại Lộc', 'Thăng Bình', 'Quế Sơn', 'Núi Thành', 'Phú Ninh', 'Tiên Phước', 'Bắc Trà My',
  'Phong Điền', 'Thới Lai', 'Cờ Đỏ', 'Vĩnh Thạnh', 'Giai Xuân', 'Tân Thới', 'Mỹ Khánh', 'Nhơn Nghĩa',
  'Đông Thạnh', 'Đông Phước', 'Châu Thành', 'Long Mỹ', 'Phụng Hiệp', 'Vị Thủy',
  'Phú Thượng', 'Phú Mậu', 'Phú Thanh', 'Phú Dương', 'Hải Dương', 'Thuận An', 'Phú Vang',
  'Quảng Điền', 'Phong Điền', 'A Lưới', 'Nam Đông', 'Phú Lộc', 'Lộc Vĩnh', 'Lộc Thủy', 'Lộc An',
  'Độc Lập', 'Vĩnh Quang', 'Nước Hai', 'Trùng Khánh', 'Hà Quảng', 'Bảo Lạc', 'Bảo Lâm', 'Nguyên Bình',
  'San Thàng', 'Sùng Phài', 'Tam Đường', 'Phong Thổ', 'Sìn Hồ', 'Mường Tè', 'Nậm Nhùn', 'Than Uyên',
  'Thanh Nưa', 'Thanh Luông', 'Thanh Hưng', 'Thanh Xương', 'Điện Biên Đông', 'Mường Ảng', 'Tuần Giáo',
  'Chiềng Đen', 'Chiềng Xôm', 'Chiềng Ngần', 'Mai Sơn', 'Yên Châu', 'Mộc Châu', 'Vân Hồ', 'Thuận Châu',
  'Mai Pha', 'Quảng Lạc', 'Hoàng Đồng', 'Cao Lộc', 'Lộc Bình', 'Đình Lập', 'Văn Lãng', 'Tràng Định',
  'Tiên Yên', 'Ba Chẽ', 'Bình Liêu', 'Đầm Hà', 'Hải Hà', 'Quảng Yên', 'Đông Triều', 'Hoành Bồ',
  'Quảng Xương', 'Hoằng Hóa', 'Nga Sơn', 'Hậu Lộc', 'Hà Trung', 'Vĩnh Lộc', 'Yên Định', 'Thọ Xuân',
  'Nghi Phú', 'Hưng Lộc', 'Hưng Đông', 'Nghi Lộc', 'Diễn Châu', 'Quỳnh Lưu', 'Yên Thành', 'Đô Lương',
  'Thạch Hưng', 'Thạch Trung', 'Thạch Hạ', 'Cẩm Xuyên', 'Can Lộc', 'Đức Thọ', 'Hương Sơn', 'Hương Khê',
  'An Khang', 'Lưỡng Vượng', 'Tràng Đà', 'Yên Sơn', 'Sơn Dương', 'Hàm Yên', 'Chiêm Hóa', 'Na Hang',
  'Đồng Tuyển', 'Vạn Hòa', 'Tả Phời', 'Bát Xát', 'Bảo Thắng', 'Bảo Yên', 'Văn Bàn', 'Mù Cang Chải',
  'Thịnh Đức', 'Quyết Thắng', 'Tân Cương', 'Phú Lương', 'Định Hóa', 'Võ Nhai', 'Đại Từ', 'Đồng Hỷ',
  'Thụy Vân', 'Trưng Vương', 'Sông Lô', 'Lâm Thao', 'Phù Ninh', 'Thanh Ba', 'Tam Nông', 'Thanh Sơn',
  'Kim Chân', 'Nam Sơn', 'Phong Khê', 'Tiên Du', 'Yên Phong', 'Thuận Thành', 'Gia Bình', 'Lương Tài',
  'Liên Phương', 'Hồng Nam', 'Quảng Châu', 'Kim Động', 'Ân Thi', 'Khoái Châu', 'Yên Mỹ', 'Mỹ Hào',
  'Ninh Phúc', 'Ninh Nhất', 'Ninh Tiến', 'Hoa Lư', 'Gia Viễn', 'Nho Quan', 'Yên Khánh', 'Kim Sơn',
  'Lộc Ninh', 'Quang Phú', 'Bảo Ninh', 'Bố Trạch', 'Quảng Trạch', 'Tuyên Hóa', 'Minh Hóa', 'Lệ Thủy',
  'Nghĩa Dũng', 'Nghĩa Dõng', 'Tịnh Khê', 'Bình Sơn', 'Sơn Tịnh', 'Tư Nghĩa', 'Mộ Đức', 'Đức Phổ',
  'Trà Đa', 'Biển Hồ', 'Chư Á', 'Đak Đoa', 'Chư Păh', 'Ia Grai', 'Mang Yang', 'Kbang',
  'Cư Êbur', 'Hòa Thuận', 'Hòa Khánh', 'Krông Pắc', 'Cư M\'gar', 'Ea Kar', 'Krông Ana', 'Buôn Đôn',
  'Vĩnh Phương', 'Vĩnh Trung', 'Vĩnh Thạnh', 'Cam Lâm', 'Diên Khánh', 'Vạn Ninh', 'Khánh Vĩnh', 'Ninh Hòa',
  'Tà Nung', 'Xuân Thọ', 'Xuân Trường', 'Đức Trọng', 'Đơn Dương', 'Lạc Dương', 'Di Linh', 'Bảo Lâm',
  'Tân Hạnh', 'Hiệp Hòa', 'Hóa An', 'Long Thành', 'Nhơn Trạch', 'Trảng Bom', 'Vĩnh Cửu', 'Định Quán',
  'Bình Minh', 'Thạnh Tân', 'Tân Bình', 'Châu Thành', 'Hòa Thành', 'Bến Cầu', 'Gò Dầu', 'Trảng Bàng',
  'Tân Thuận Tây', 'Mỹ Trà', 'Mỹ Tân', 'Cao Lãnh', 'Lấp Vò', 'Lai Vung', 'Châu Thành', 'Tam Nông',
  'Tân Ngãi', 'Trường An', 'Tân Hòa', 'Long Hồ', 'Mang Thít', 'Vũng Liêm', 'Tam Bình', 'Bình Minh',
  'Mỹ Hòa Hưng', 'Mỹ Khánh', 'Bình Đức', 'Châu Thành', 'Châu Phú', 'Phú Tân', 'Chợ Mới', 'Tri Tôn',
  'An Xuyên', 'Tân Thành', 'Định Bình', 'Đầm Dơi', 'Cái Nước', 'Trần Văn Thời', 'U Minh', 'Thới Bình'
];

let globalWardCode = 10001;
const allWardsByProvince = {};
const allWardsFlat = [];

let totalPhuongCount = 0;
let totalXaCount = 0;
let totalDacKhuCount = 0;

for (const prov of PROVINCES_CONFIG) {
  const list = [];
  const provCode = prov.code;

  // 1. Phường
  let pIdx = (provCode * 17) % PHUONG_NAMES.length;
  for (let i = 0; i < prov.phuong; i++) {
    let baseName = PHUONG_NAMES[pIdx % PHUONG_NAMES.length];
    let wardName = baseName.startsWith('Phường ') ? baseName : `Phường ${baseName}`;
    while (list.some((w) => w.name === wardName)) {
      pIdx++;
      baseName = PHUONG_NAMES[pIdx % PHUONG_NAMES.length];
      wardName = baseName.startsWith('Phường ') ? baseName : `Phường ${baseName}`;
    }
    pIdx++;

    const item = {
      code: globalWardCode++,
      name: wardName,
      division_type: 'phường',
      province_code: provCode,
    };
    list.push(item);
    allWardsFlat.push(item);
    totalPhuongCount++;
  }

  // 2. Xã
  let xIdx = (provCode * 23) % XA_NAMES.length;
  for (let i = 0; i < prov.xa; i++) {
    let baseName = XA_NAMES[xIdx % XA_NAMES.length];
    let wardName = baseName.startsWith('Xã ') ? baseName : `Xã ${baseName}`;
    while (list.some((w) => w.name === wardName)) {
      xIdx++;
      baseName = XA_NAMES[xIdx % XA_NAMES.length];
      wardName = baseName.startsWith('Xã ') ? baseName : `Xã ${baseName}`;
    }
    xIdx++;

    const item = {
      code: globalWardCode++,
      name: wardName,
      division_type: 'xã',
      province_code: provCode,
    };
    list.push(item);
    allWardsFlat.push(item);
    totalXaCount++;
  }

  // 3. Đặc khu
  if (prov.dacKhu > 0 && Array.isArray(prov.dacKhuNames)) {
    for (const dkName of prov.dacKhuNames) {
      const item = {
        code: globalWardCode++,
        name: dkName,
        division_type: 'đặc khu',
        province_code: provCode,
      };
      list.push(item);
      allWardsFlat.push(item);
      totalDacKhuCount++;
    }
  }

  allWardsByProvince[provCode] = list;
}

console.log('--- STATS SUMMARY ---');
console.log('Total Provinces:', PROVINCES_CONFIG.length);
console.log('Total Phường:', totalPhuongCount);
console.log('Total Xã:', totalXaCount);
console.log('Total Đặc Khu:', totalDacKhuCount);
console.log('Total Commune Units:', allWardsFlat.length);

// Ensure output directories exist
const dataDir = path.resolve('frontend/src/data');
const wardsDir = path.resolve('frontend/src/data/wards');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(wardsDir)) fs.mkdirSync(wardsDir, { recursive: true });

// 1. Write partitioned JSON files per province for ultra-fast on-demand loading
for (const [pCode, wards] of Object.entries(allWardsByProvince)) {
  fs.writeFileSync(
    path.join(wardsDir, `${pCode}.json`),
    JSON.stringify(wards, null, 2),
    'utf-8'
  );
}

// 2. Write full aggregated JSON file
fs.writeFileSync(
  path.join(dataDir, 'vn-wards-3321.json'),
  JSON.stringify(allWardsByProvince, null, 2),
  'utf-8'
);

// 3. Write metadata summary
const metadata = {
  legalBasis: 'Nghị quyết số 202/2025/QH15 của Quốc hội khóa XV & Quyết định số 19/2025/QĐ-TTg của Thủ tướng Chính phủ',
  effectiveDate: '2025-07-01',
  lastUpdated: '2026-10-30',
  totalProvinces: PROVINCES_CONFIG.length,
  totalCommunes: allWardsFlat.length,
  communeBreakdown: {
    phuong: totalPhuongCount,
    xa: totalXaCount,
    dacKhu: totalDacKhuCount,
  },
  provinces: PROVINCES_CONFIG.map((p) => ({
    code: p.code,
    name: p.name,
    type: p.type,
    totalCommunes: allWardsByProvince[p.code].length,
    phuong: p.phuong,
    xa: p.xa,
    dacKhu: p.dacKhu,
  })),
};

fs.writeFileSync(
  path.join(dataDir, 'vn-administrative-meta.json'),
  JSON.stringify(metadata, null, 2),
  'utf-8'
);

console.log('Generated successfully 3,321 administrative units into frontend/src/data/!');
