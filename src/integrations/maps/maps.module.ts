import { Global, Module } from '@nestjs/common';
import { PublicPlacesController } from './public-places.controller.js';
import { MapsService } from './maps.service.js';

@Global()
@Module({
  controllers: [PublicPlacesController],
  providers: [MapsService],
  exports: [MapsService],
})
export class MapsModule {}
