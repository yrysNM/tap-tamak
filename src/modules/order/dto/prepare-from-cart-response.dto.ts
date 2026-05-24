export interface PrepareFromCartCookDto {
  id: string;
  businessName: string;
  rating: number;
  chefFirstName: string;
  chefLastName: string;
}

export interface PrepareFromCartLineDto {
  dishId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineSubtotal: number;
}

export interface PrepareFromCartCookGroupDto {
  cook: PrepareFromCartCookDto;
  items: PrepareFromCartLineDto[];
  itemsTotal: number;
  totalAmount: number;
}

export interface PrepareFromCartDeliveryDto {
  addressLine: string;
  city?: string;
  entrance?: string;
  intercom?: string;
  floor?: string;
  apartment?: string;
  contactPhone: string;
  courierComment?: string;
  saveAddress: boolean;
}

export interface PrepareFromCartResponseDto {
  basketId: string;
  cook: PrepareFromCartCookDto | null;
  groups: PrepareFromCartCookGroupDto[];
  delivery: PrepareFromCartDeliveryDto;
  items: PrepareFromCartLineDto[];
  itemsTotal: number;
  platformFeePercent: number;
  platformFee: number;
  deliveryFee: number;
  discountAmount: number;
  totalAmount: number;
}
