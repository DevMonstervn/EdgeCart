import type { Env } from '../../types/env.js';
import { CatalogService } from '../../services/catalog.service.js';
import { OrderService } from '../../services/order.service.js';
import type {
  AIToolDefinition,
  AIProductCardData,
  AIProductComparisonData,
  AIOrderSummaryData,
  AIStorePolicyData,
} from '@edgecart/shared';
import {
  AISearchProductsInputSchema,
  AIGetProductDetailsInputSchema,
  AICompareProductsInputSchema,
  AIGetStorePolicyInputSchema,
  AIGetMyOrdersInputSchema,
  AIGetMyOrderDetailsInputSchema,
} from '@edgecart/shared';

export interface ToolExecutionContext {
  env: Env;
  userId?: string | null;
  sessionId?: string | null;
}

export interface ToolExecutionResult {
  toolName: string;
  result: unknown;
  productCards?: AIProductCardData[];
  comparison?: AIProductComparisonData;
  orders?: AIOrderSummaryData[];
  policy?: AIStorePolicyData;
}

export const BUSINESS_TOOLS: AIToolDefinition[] = [
  {
    name: 'search_products',
    description:
      'Tìm kiếm sản phẩm thực tế trong kho hàng EdgeCart theo từ khóa, danh mục hoặc khoảng giá (VNĐ). Luôn gọi công cụ này khi khách hàng hỏi mua, tìm kiếm sản phẩm hoặc hỏi về giá.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Từ khóa tìm kiếm (ví dụ: áo polo, giày thể thao, tai nghe, nước hoa)',
        },
        categorySlug: {
          type: 'string',
          description: 'Slug danh mục sản phẩm nếu người dùng nêu rõ (ví dụ: thoi-trang, cong-nghe, my-pham)',
        },
        minPrice: {
          type: 'number',
          description: 'Mức giá tối thiểu bằng VNĐ',
        },
        maxPrice: {
          type: 'number',
          description: 'Mức giá tối đa bằng VNĐ (ngân sách của khách hàng)',
        },
        limit: {
          type: 'number',
          description: 'Số lượng sản phẩm tối đa cần lấy (mặc định 5, tối đa 10)',
        },
      },
    },
  },
  {
    name: 'get_product_details',
    description:
      'Lấy thông tin chi tiết đầy đủ, cấu hình, biến thể và số lượng tồn kho của một sản phẩm theo slug hoặc ID.',
    parameters: {
      type: 'object',
      properties: {
        slugOrId: {
          type: 'string',
          description: 'Slug hoặc ID của sản phẩm cần tra cứu chi tiết',
        },
      },
      required: ['slugOrId'],
    },
  },
  {
    name: 'compare_products',
    description:
      'So sánh song song 2 đến 4 sản phẩm theo mức giá, danh mục, đánh giá và thông số kỹ thuật.',
    parameters: {
      type: 'object',
      properties: {
        productSlugsOrIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Danh sách slug hoặc ID của các sản phẩm cần đối chiếu so sánh',
        },
      },
      required: ['productSlugsOrIds'],
    },
  },
  {
    name: 'get_store_policy',
    description:
      'Tra cứu chính sách chính thức của sàn EdgeCart về: vận chuyển (shipping), thanh toán (payment), đổi trả & hoàn tiền (return_refund), bảo hành (warranty), hoặc thông tin chung (general).',
    parameters: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          enum: ['shipping', 'payment', 'return_refund', 'warranty', 'general'],
          description: 'Chủ đề chính sách cần tra cứu',
        },
      },
      required: ['topic'],
    },
  },
  {
    name: 'get_my_orders',
    description:
      'Tra cứu danh sách đơn hàng gần đây của chính người dùng hiện tại. Yêu cầu người dùng đã đăng nhập.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Số lượng đơn hàng cần xem (mặc định 5, tối đa 10)',
        },
        status: {
          type: 'string',
          description: 'Lọc trạng thái đơn hàng (ví dụ: PENDING, SHIPPING, DELIVERED, CANCELLED)',
        },
      },
    },
  },
  {
    name: 'get_my_order_details',
    description:
      'Tra cứu chi tiết một đơn hàng cụ thể (mã đơn, danh sách mặt hàng, trạng thái giao nhận và thanh toán) thuộc quyền sở hữu của người dùng hiện tại.',
    parameters: {
      type: 'object',
      properties: {
        orderNumberOrId: {
          type: 'string',
          description: 'Mã đơn hàng (ví dụ: ORD-20261028-XXXX) hoặc ID đơn hàng',
        },
      },
      required: ['orderNumberOrId'],
    },
  },
];

export async function executeBusinessTool(
  toolName: string,
  args: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const { env, userId } = context;
  const catalogService = new CatalogService(env);
  const orderService = new OrderService(env);

  switch (toolName) {
    case 'search_products': {
      const parsed = AISearchProductsInputSchema.safeParse(args);
      const params = parsed.success
        ? parsed.data
        : { query: undefined, categorySlug: undefined, minPrice: undefined, maxPrice: undefined, limit: 5 };
      const limit = params.limit || 5;
      const safeQ = params.query ? params.query.trim().slice(0, 50) : undefined;

      const result = await catalogService.getProducts({
        q: safeQ,
        category: params.categorySlug,
        minPrice: params.minPrice,
        maxPrice: params.maxPrice,
        limit,
      });

      const productCards: AIProductCardData[] = (result.products || []).map((p) => {
        let defaultImage: string | null = null;
        if (p.images && p.images.length > 0) {
          defaultImage = p.images[0].imageUrl;
        }

        const totalStock = p.variants?.reduce((sum, v) => sum + (v.stockQuantity || 0), 0) ?? 0;

        return {
          id: p.id,
          name: p.name,
          slug: p.slug,
          basePrice: p.basePrice,
          salePrice: p.salePrice ?? null,
          imageUrl: defaultImage,
          stockQuantity: totalStock,
          storeName: p.store?.name || 'EdgeCart Official',
          categoryName: p.category?.name || 'Sản phẩm',
          isFeatured: p.isFeatured || false,
        };
      });

      return {
        toolName,
        result: {
          totalFound: result.meta?.total || productCards.length,
          products: productCards.map((c) => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            price: c.salePrice || c.basePrice,
            originalPrice: c.basePrice,
            stock: c.stockQuantity > 0 ? `${c.stockQuantity} sản phẩm` : 'Hết hàng',
            store: c.storeName,
          })),
        },
        productCards,
      };
    }

    case 'get_product_details': {
      const parsed = AIGetProductDetailsInputSchema.safeParse(args);
      if (!parsed.success) {
        return { toolName, result: { error: 'Tham số tra cứu sản phẩm không hợp lệ' } };
      }

      try {
        const p = await catalogService.getProductBySlug(parsed.data.slugOrId);
        const card: AIProductCardData = {
          id: p.id,
          name: p.name,
          slug: p.slug,
          basePrice: p.basePrice,
          salePrice: p.salePrice ?? null,
          imageUrl: p.images?.[0]?.imageUrl || null,
          stockQuantity: p.variants?.reduce((s, v) => s + (v.stockQuantity || 0), 0) ?? 0,
          storeName: p.store?.name || 'EdgeCart Official',
          categoryName: p.category?.name || 'Sản phẩm',
          isFeatured: p.isFeatured || false,
        };

        return {
          toolName,
          result: {
            id: p.id,
            name: p.name,
            slug: p.slug,
            basePrice: p.basePrice,
            salePrice: p.salePrice,
            description: p.description,
            category: p.category?.name,
            store: p.store?.name || 'EdgeCart Official',
            variants: p.variants?.map((v) => ({
              sku: v.sku,
              title: v.title,
              price: v.price,
              stock: v.stockQuantity,
            })),
          },
          productCards: [card],
        };
      } catch {
        return {
          toolName,
          result: { error: `Không tìm thấy sản phẩm với định danh "${parsed.data.slugOrId}"` },
        };
      }
    }

    case 'compare_products': {
      const parsed = AICompareProductsInputSchema.safeParse(args);
      if (!parsed.success) {
        return { toolName, result: { error: 'Cần tối thiểu 2 mã hoặc tên sản phẩm để so sánh' } };
      }

      const products: AIProductCardData[] = [];
      for (const rawIdOrSlug of parsed.data.productSlugsOrIds) {
        const idOrSlug = (rawIdOrSlug || '').trim().slice(0, 50);
        if (!idOrSlug) continue;

        let p: any = null;
        try {
          p = await catalogService.getProductBySlug(idOrSlug);
        } catch {
          // 1. Fall back to search by product name/keyword
          try {
            const searchRes = await catalogService.getProducts({ q: idOrSlug, limit: 1 });
            if (searchRes.products && searchRes.products.length > 0) {
              p = searchRes.products[0];
            }
          } catch {}

          // 2. If phrase search yielded no match, extract significant keywords (e.g. brand/model name)
          if (!p) {
            const words = idOrSlug.split(/\s+/).filter((w) => w.length >= 3);
            for (let i = words.length - 1; i >= 0; i--) {
              const kw = words[i];
              // Skip generic words like 'sản', 'phẩm', 'laptop' if other words exist
              if (['laptop', 'hàng', 'loại', 'máy'].includes(kw.toLowerCase()) && words.length > 1) {
                continue;
              }
              try {
                const searchRes = await catalogService.getProducts({ q: kw, limit: 1 });
                if (searchRes.products && searchRes.products.length > 0) {
                  p = searchRes.products[0];
                  break;
                }
              } catch {}
            }
          }
        }

        if (p && !products.some((existing) => existing.id === p.id)) {
          products.push({
            id: p.id,
            name: p.name,
            slug: p.slug,
            basePrice: p.basePrice,
            salePrice: p.salePrice ?? null,
            imageUrl: p.images?.[0]?.imageUrl || null,
            stockQuantity: p.variants?.reduce((s: number, v: any) => s + (v.stockQuantity || 0), 0) ?? 0,
            storeName: p.store?.name || 'EdgeCart Official',
            categoryName: p.category?.name || 'Sản phẩm',
            isFeatured: p.isFeatured || false,
          });
        }
      }

      if (products.length < 2) {
        return {
          toolName,
          result: {
            error:
              'Không tìm thấy đủ ít nhất 2 sản phẩm tương ứng trong hệ thống để thực hiện so sánh. Vui lòng kiểm tra lại tên sản phẩm.',
            comparedCount: products.length,
          },
        };
      }

      const comparison: AIProductComparisonData = {
        products,
        attributes: [
          {
            name: 'price',
            label: 'Giá ưu đãi (VNĐ)',
            values: Object.fromEntries(
              products.map((p) => [p.id, p.salePrice ? p.salePrice.toLocaleString('vi-VN') + ' đ' : p.basePrice.toLocaleString('vi-VN') + ' đ'])
            ),
          },
          {
            name: 'store',
            label: 'Nhà cung cấp',
            values: Object.fromEntries(products.map((p) => [p.id, p.storeName || 'EdgeCart Official'])),
          },
          {
            name: 'category',
            label: 'Danh mục',
            values: Object.fromEntries(products.map((p) => [p.id, p.categoryName || 'Khác'])),
          },
          {
            name: 'stock',
            label: 'Tình trạng hàng',
            values: Object.fromEntries(products.map((p) => [p.id, p.stockQuantity > 0 ? `Còn hàng (${p.stockQuantity})` : 'Tạm hết'])),
          },
        ],
      };

      return {
        toolName,
        result: {
          comparedCount: products.length,
          products: products.map((p) => ({
            name: p.name,
            price: p.salePrice || p.basePrice,
            stock: p.stockQuantity,
          })),
        },
        productCards: products,
        comparison,
      };
    }

    case 'get_store_policy': {
      const parsed = AIGetStorePolicyInputSchema.safeParse(args);
      const topic = parsed.success ? parsed.data.topic : 'general';

      const policies: Record<string, AIStorePolicyData> = {
        shipping: {
          topic: 'shipping',
          title: 'Chính sách vận chuyển & Giao nhận EdgeCart',
          summary: 'Miễn phí vận chuyển toàn quốc cho đơn hàng từ 500.000 VNĐ. Phí chuẩn 30.000 VNĐ cho đơn dưới 500.000 VNĐ.',
          details: [
            'Miễn phí giao hàng (0đ) áp dụng tự động cho giỏ hàng có tổng giá trị từ 500.000 VNĐ trở lên.',
            'Cước phí vận chuyển tiêu chuẩn cố định là 30.000 VNĐ cho các đơn hàng dưới 500.000 VNĐ.',
            'Thời gian giao hàng: Nội thành Hà Nội & TP.HCM từ 1-2 ngày; các tỉnh thành khác từ 2-4 ngày làm việc.',
            'Hỗ trợ theo dõi lộ trình đơn hàng trực tiếp qua tài khoản EdgeCart.',
          ],
        },
        payment: {
          topic: 'payment',
          title: 'Phương thức thanh toán bảo mật EdgeCart',
          summary: 'Hỗ trợ thanh toán khi nhận hàng (COD) và Chuyển khoản ngân hàng / Quét mã VietQR nhanh chóng.',
          details: [
            'COD (Thanh toán khi nhận hàng): Nhận hàng kiểm tra và thanh toán tiền mặt trực tiếp cho nhân viên giao hàng.',
            'Chuyển khoản ngân hàng qua mã VietQR: Quét mã QR thanh toán tự động xác nhận trong vòng 1-2 phút.',
            'Bảo mật tuyệt đối thông tin thanh toán, mã hóa chuẩn SSL 256-bit.',
          ],
        },
        return_refund: {
          topic: 'return_refund',
          title: 'Chính sách đổi trả & Hoàn tiền',
          summary: 'Đổi trả miễn phí trong vòng 30 ngày đối với sản phẩm lỗi từ nhà sản xuất hoặc giao sai mẫu mã.',
          details: [
            'Thời hạn đổi trả: 30 ngày kể từ ngày nhận hàng thành công.',
            'Điều kiện: Sản phẩm còn nguyên tem mác, hộp đựng và chưa qua sử dụng hoặc có dấu hiệu tẩy rửa.',
            'Hoàn tiền: Hoàn tiền qua tài khoản ngân hàng của khách trong vòng 3-5 ngày làm việc sau khi EdgeCart nhận lại hàng.',
            'Phí gửi đổi trả: Miễn phí hoàn toàn nếu lỗi phát sinh từ EdgeCart hoặc nhà bán lẻ.',
          ],
        },
        warranty: {
          topic: 'warranty',
          title: 'Chính sách bảo hành sản phẩm',
          summary: 'Bảo hành chính hãng tối thiểu 12 tháng đối với thiết bị điện tử và công nghệ.',
          details: [
            'Sản phẩm công nghệ, điện tử: Bảo hành chính hãng 12-24 tháng.',
            'Hàng thời trang & phụ kiện: Đổi mới trong 7 ngày nếu phát sinh lỗi đường may hoặc phụ kiện kèm theo.',
            'Kích hoạt bảo hành điện tử tự động qua số điện thoại đặt hàng.',
          ],
        },
        general: {
          topic: 'general',
          title: 'Thông tin chung về sàn thương mại điện tử EdgeCart',
          summary: 'EdgeCart là sàn thương mại điện tử Edge-native tốc độ siêu tốc, cam kết 100% hàng chính hãng.',
          details: [
            'Tất cả sản phẩm bán trên sàn đều được kiểm duyệt nguồn gốc xuất xứ.',
            'Hỗ trợ khách hàng 24/7 qua trợ lý AI và tổng đài viên.',
            'Giao dịch được bảo vệ với chính sách EdgeCart Guarantee.',
          ],
        },
      };

      const policyData = policies[topic] || policies.general;
      return {
        toolName,
        result: policyData,
        policy: policyData,
      };
    }

    case 'get_my_orders': {
      if (!userId) {
        return {
          toolName,
          result: {
            error:
              'Bạn chưa đăng nhập. Vui lòng đăng nhập tài khoản EdgeCart để tra cứu thông tin đơn hàng cá nhân của mình.',
            requiresAuth: true,
          },
        };
      }

      const parsed = AIGetMyOrdersInputSchema.safeParse(args);
      const limit = parsed.success && parsed.data.limit ? parsed.data.limit : 5;

      const userOrders = await orderService.getUserOrders(userId);
      const slicedOrders = userOrders.slice(0, limit);

      const orderSummaries: AIOrderSummaryData[] = slicedOrders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        createdAt: o.createdAt,
        totalAmount: o.totalAmount,
        paymentMethod: o.paymentMethod,
        paymentStatus: o.paymentStatus,
        shippingStatus: o.shippingStatus,
        itemsCount: o.items?.length || 0,
        items: (o.items || []).map((it) => ({
          productName: it.productName,
          variantTitle: it.variantTitle,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          totalPrice: it.totalPrice,
        })),
      }));

      return {
        toolName,
        result: {
          totalOrders: userOrders.length,
          orders: orderSummaries.map((s) => ({
            orderNumber: s.orderNumber,
            date: s.createdAt,
            total: s.totalAmount.toLocaleString('vi-VN') + ' đ',
            shippingStatus: s.shippingStatus,
            paymentStatus: s.paymentStatus,
            itemCount: s.itemsCount,
          })),
        },
        orders: orderSummaries,
      };
    }

    case 'get_my_order_details': {
      if (!userId) {
        return {
          toolName,
          result: {
            error:
              'Bạn chưa đăng nhập. Vui lòng đăng nhập tài khoản EdgeCart để tra cứu chi tiết đơn hàng của mình.',
            requiresAuth: true,
          },
        };
      }

      const parsed = AIGetMyOrderDetailsInputSchema.safeParse(args);
      if (!parsed.success) {
        return { toolName, result: { error: 'Vui lòng cung cấp mã đơn hàng hợp lệ.' } };
      }

      const queryTerm = parsed.data.orderNumberOrId.trim();

      try {
        // Try getting directly by ID with strict ownership check
        const order = await orderService.getOrderById(queryTerm, userId);
        const orderSummary: AIOrderSummaryData = {
          id: order.id,
          orderNumber: order.orderNumber,
          createdAt: order.createdAt,
          totalAmount: order.totalAmount,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          shippingStatus: order.shippingStatus,
          itemsCount: order.items?.length || 0,
          items: (order.items || []).map((it) => ({
            productName: it.productName,
            variantTitle: it.variantTitle,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            totalPrice: it.totalPrice,
          })),
        };

        return {
          toolName,
          result: {
            orderNumber: order.orderNumber,
            recipient: order.shippingName,
            address: `${order.shippingAddress}, ${order.shippingWard}, ${order.shippingDistrict ? order.shippingDistrict + ', ' : ''}${order.shippingProvince}`,
            paymentMethod: order.paymentMethod,
            paymentStatus: order.paymentStatus,
            shippingStatus: order.shippingStatus,
            totalAmount: order.totalAmount.toLocaleString('vi-VN') + ' đ',
            shippingFee: order.shippingFee.toLocaleString('vi-VN') + ' đ',
            items: order.items?.map((it) => ({
              name: it.productName,
              variant: it.variantTitle,
              qty: it.quantity,
              price: it.unitPrice.toLocaleString('vi-VN') + ' đ',
            })),
          },
          orders: [orderSummary],
        };
      } catch {
        // If not found by ID, look through user's orders by orderNumber
        const allUserOrders = await orderService.getUserOrders(userId);
        const matched = allUserOrders.find(
          (o) => o.orderNumber.toUpperCase() === queryTerm.toUpperCase()
        );

        if (matched) {
          const orderSummary: AIOrderSummaryData = {
            id: matched.id,
            orderNumber: matched.orderNumber,
            createdAt: matched.createdAt,
            totalAmount: matched.totalAmount,
            paymentMethod: matched.paymentMethod,
            paymentStatus: matched.paymentStatus,
            shippingStatus: matched.shippingStatus,
            itemsCount: matched.items?.length || 0,
            items: (matched.items || []).map((it) => ({
              productName: it.productName,
              variantTitle: it.variantTitle,
              quantity: it.quantity,
              unitPrice: it.unitPrice,
              totalPrice: it.totalPrice,
            })),
          };

          return {
            toolName,
            result: {
              orderNumber: matched.orderNumber,
              recipient: matched.shippingName,
              address: `${matched.shippingAddress}, ${matched.shippingWard}, ${matched.shippingDistrict ? matched.shippingDistrict + ', ' : ''}${matched.shippingProvince}`,
              paymentMethod: matched.paymentMethod,
              paymentStatus: matched.paymentStatus,
              shippingStatus: matched.shippingStatus,
              totalAmount: matched.totalAmount.toLocaleString('vi-VN') + ' đ',
              shippingFee: matched.shippingFee.toLocaleString('vi-VN') + ' đ',
              items: matched.items?.map((it) => ({
                name: it.productName,
                variant: it.variantTitle,
                qty: it.quantity,
                price: it.unitPrice.toLocaleString('vi-VN') + ' đ',
              })),
            },
            orders: [orderSummary],
          };
        }

        return {
          toolName,
          result: {
            error: `Không tìm thấy đơn hàng "${queryTerm}" trong tài khoản của bạn. Vui lòng kiểm tra lại mã đơn hàng.`,
          },
        };
      }
    }

    default:
      return {
        toolName,
        result: { error: `Công cụ "${toolName}" không được hỗ trợ.` },
      };
  }
}
