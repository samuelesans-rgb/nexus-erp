-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerified" TIMESTAMP(3),
ADD COLUMN     "image" TEXT,
ADD COLUMN     "lastLogin" TIMESTAMP(3),
ALTER COLUMN "role" SET DEFAULT 'ADMIN';
