-- CreateEnum
CREATE TYPE "DishPreparationType" AS ENUM ('FAST', 'LONG');

-- AlterTable
ALTER TABLE "Dish" ADD COLUMN     "cookingTime" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "preparationType" "DishPreparationType" NOT NULL DEFAULT 'FAST';

-- CreateTable
CREATE TABLE "Menu" (
    "id" TEXT NOT NULL,
    "cookId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Menu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_DishToMenu" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_DishToMenu_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "Menu_date_idx" ON "Menu"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Menu_cookId_date_key" ON "Menu"("cookId", "date");

-- CreateIndex
CREATE INDEX "_DishToMenu_B_index" ON "_DishToMenu"("B");

-- AddForeignKey
ALTER TABLE "Menu" ADD CONSTRAINT "Menu_cookId_fkey" FOREIGN KEY ("cookId") REFERENCES "Cook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DishToMenu" ADD CONSTRAINT "_DishToMenu_A_fkey" FOREIGN KEY ("A") REFERENCES "Dish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DishToMenu" ADD CONSTRAINT "_DishToMenu_B_fkey" FOREIGN KEY ("B") REFERENCES "Menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;
