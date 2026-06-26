import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete the authenticated user account',
    description:
      'Anonymizes personal data, removes ephemeral records and uploaded files, and disables login. Blocked while active orders exist.',
  })
  async deleteMe(
    @CurrentUser() user: User,
    @Body() dto: DeleteAccountDto,
  ): Promise<void> {
    await this.usersService.deleteAccount(user.id, dto);
  }
}
