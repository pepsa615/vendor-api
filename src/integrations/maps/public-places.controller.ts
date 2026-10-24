import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { MapsService } from './maps.service.js';

@ApiTags('Public ordering')
@Throttle({ default: { limit: 40, ttl: 60_000 } })
@Controller({ path: 'public/places', version: '1' })
export class PublicPlacesController {
  constructor(private readonly maps: MapsService) {}

  @Get('autocomplete')
  autocomplete(@Query('input') input = '') {
    return this.maps.placeAutocomplete(input);
  }

  @Get('details')
  details(@Query('placeId') placeId = '') {
    return this.maps.placeDetails(placeId);
  }
}
