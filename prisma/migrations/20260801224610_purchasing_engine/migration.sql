-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentLinkType" ADD VALUE 'PURCHASE_ORDER_TO_RECEIPT';
ALTER TYPE "DocumentLinkType" ADD VALUE 'RECEIPT_TO_PURCHASE_INVOICE';
ALTER TYPE "DocumentLinkType" ADD VALUE 'PURCHASE_ORDER_TO_PURCHASE_INVOICE';
ALTER TYPE "DocumentLinkType" ADD VALUE 'RECEIPT_TO_PURCHASE_RETURN';
ALTER TYPE "DocumentLinkType" ADD VALUE 'PURCHASE_RETURN_TO_CREDIT_NOTE';

-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'GOODS_RECEIPT';
