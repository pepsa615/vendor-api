import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';

export interface AddressInput {
  address: string;
  city: string;
  state: string;
  country: 'NG';
  postalCode?: string;
  landmark?: string;
  placeId?: string;
}
export interface GeocodedAddress extends AddressInput {
  normalizedAddress: string;
  placeId: string;
  latitude: number;
  longitude: number;
  normalizedCity: string;
  normalizedState: string;
}

export interface PlaceSuggestion {
  placeId: string;
  description: string;
}

export interface ResolvedPlace {
  placeId: string;
  formattedAddress: string;
  city: string;
  state: string;
  postalCode?: string;
  country: 'NG';
  latitude: number;
  longitude: number;
}

type GoogleAddressComponent = {
  long_name: string;
  short_name: string;
  types: string[];
};

@Injectable()
export class MapsService {
  constructor(private readonly config: ConfigService) {}

  private settings() {
    const apiKey = this.config.get<string>('GOOGLE_MAPS_API_KEY');
    if (!apiKey && this.config.get<string>('NODE_ENV') !== 'production')
      return null;
    if (!apiKey)
      throw new ServiceUnavailableException('Address pricing is unavailable');
    return {
      apiKey,
      timeout: Number(this.config.get('GOOGLE_MAPS_TIMEOUT_MS') ?? 5000),
    };
  }

  async placeAutocomplete(input: string): Promise<PlaceSuggestion[]> {
    const query = input.trim();
    if (query.length < 3) return [];
    const settings = this.settings();
    if (!settings) {
      const token = Buffer.from(query, 'utf8').toString('base64url');
      return [
        {
          placeId: `local:${token}`,
          description: `${query}, Nigeria`,
        },
      ];
    }
    const { apiKey, timeout } = settings;
    try {
      const params = new URLSearchParams({
        input: query,
        key: apiKey,
        components: 'country:ng',
      });
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`,
        { signal: AbortSignal.timeout(timeout) },
      );
      if (!response.ok) throw new Error('HTTP failure');
      const body = (await response.json()) as {
        status?: string;
        predictions?: Array<{ place_id: string; description: string }>;
      };
      if (!['OK', 'ZERO_RESULTS'].includes(body.status ?? ''))
        throw new Error('Provider failure');
      return (body.predictions ?? []).slice(0, 8).map((item) => ({
        placeId: item.place_id,
        description: item.description,
      }));
    } catch {
      throw new BadGatewayException('Address search is unavailable');
    }
  }

  async placeDetails(placeId: string): Promise<ResolvedPlace> {
    const trimmed = placeId.trim();
    if (trimmed.length < 3)
      throw new UnprocessableEntityException('Select a valid address');
    const settings = this.settings();
    if (!settings) {
      if (!trimmed.startsWith('local:'))
        throw new UnprocessableEntityException('Select a valid address');
      const query = Buffer.from(
        trimmed.slice('local:'.length),
        'base64url',
      ).toString('utf8');
      const parts = query.split(',').map((part) => part.trim());
      const geocoded = await this.geocode({
        address: parts[0] ?? query,
        city: parts[1] ?? 'Lagos',
        state: (parts[2] ?? 'Lagos').replace(/\s+state$/i, ''),
        country: 'NG',
      });
      return {
        placeId: trimmed,
        formattedAddress: geocoded.normalizedAddress,
        city: geocoded.normalizedCity,
        state: this.canonicalState(geocoded.normalizedState),
        country: 'NG',
        latitude: geocoded.latitude,
        longitude: geocoded.longitude,
      };
    }
    const { apiKey, timeout } = settings;
    try {
      const params = new URLSearchParams({
        place_id: trimmed,
        key: apiKey,
        fields: 'place_id,formatted_address,address_component,geometry',
      });
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?${params}`,
        { signal: AbortSignal.timeout(timeout) },
      );
      if (!response.ok) throw new Error('HTTP failure');
      const body = (await response.json()) as {
        status?: string;
        result?: {
          place_id: string;
          formatted_address: string;
          address_components?: GoogleAddressComponent[];
          geometry?: { location?: { lat: number; lng: number } };
        };
      };
      const result = body.result;
      const location = result?.geometry?.location;
      if (body.status !== 'OK' || !result || !location)
        throw new UnprocessableEntityException(
          'Select a valid Nigerian address',
        );
      const component = (type: string) =>
        result.address_components?.find((item) => item.types.includes(type))
          ?.long_name;
      const country = result.address_components?.find((item) =>
        item.types.includes('country'),
      )?.short_name;
      if (country !== 'NG')
        throw new UnprocessableEntityException(
          'Address must be within Nigeria',
        );
      const city =
        component('locality') ?? component('administrative_area_level_2');
      const state = component('administrative_area_level_1');
      if (!city || !state)
        throw new UnprocessableEntityException(
          'Select a complete street address',
        );
      return {
        placeId: result.place_id,
        formattedAddress: result.formatted_address,
        city,
        state: this.canonicalState(state),
        postalCode: component('postal_code'),
        country: 'NG',
        latitude: location.lat,
        longitude: location.lng,
      };
    } catch (error) {
      if (error instanceof UnprocessableEntityException) throw error;
      throw new BadGatewayException('Address details are unavailable');
    }
  }

  async resolveAddress(input: AddressInput): Promise<GeocodedAddress> {
    const placeId = input.placeId?.trim();
    if (placeId) return this.geocodeFromPlace(input, placeId);
    return this.geocode(input);
  }

  private async geocodeFromPlace(
    input: AddressInput,
    placeId: string,
  ): Promise<GeocodedAddress> {
    const details = await this.placeDetails(placeId);
    if (!input.city?.trim() && !details.city?.trim())
      throw new UnprocessableEntityException('City is required');
    const city = input.city?.trim() || details.city;
    if (!this.stateMatches(input.state, details.state))
      throw new UnprocessableEntityException(
        'Address does not match the supplied state',
      );
    const canonicalState = this.canonicalState(input.state);
    const normalizedState = this.canonicalState(details.state || input.state);
    return {
      address: input.address,
      landmark: input.landmark,
      postalCode: input.postalCode?.trim() || details.postalCode,
      city,
      state: canonicalState,
      country: 'NG',
      normalizedAddress: details.formattedAddress,
      placeId: details.placeId,
      latitude: details.latitude,
      longitude: details.longitude,
      normalizedCity: this.normalize(city),
      normalizedState: this.normalize(normalizedState),
    };
  }

  async geocode(input: AddressInput): Promise<GeocodedAddress> {
    const settings = this.settings();
    if (!settings) return this.localGeocode(input);
    const { apiKey, timeout } = settings;
    const query = [
      input.address,
      input.landmark,
      input.city,
      input.state,
      input.postalCode,
      'Nigeria',
    ]
      .filter(Boolean)
      .join(', ');
    try {
      const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
      url.searchParams.set('address', query);
      url.searchParams.set('components', 'country:NG');
      url.searchParams.set('region', 'ng');
      url.searchParams.set('key', apiKey);
      const response = await fetch(url, {
        signal: AbortSignal.timeout(timeout),
      });
      if (!response.ok) throw new Error('HTTP failure');
      const body = (await response.json()) as {
        status: string;
        results?: Array<{
          formatted_address: string;
          place_id: string;
          geometry: { location: { lat: number; lng: number } };
          address_components: Array<{
            long_name: string;
            short_name: string;
            types: string[];
          }>;
        }>;
      };
      if (body.status !== 'OK' || !body.results?.length)
        throw new UnprocessableEntityException('Address could not be resolved');
      const result = body.results[0];
      const component = (...types: string[]) =>
        result.address_components.find((item) =>
          types.some((type) => item.types.includes(type)),
        );
      const country = component('country');
      const state = component('administrative_area_level_1');
      const cityComponent =
        component('locality') ??
        component('postal_town') ??
        component('administrative_area_level_2') ??
        component('administrative_area_level_3') ??
        component('sublocality', 'sublocality_level_1') ??
        component('neighborhood');
      if (!country || country.short_name !== 'NG')
        throw new UnprocessableEntityException(
          'Address must resolve within Nigeria',
        );
      if (!input.city?.trim())
        throw new UnprocessableEntityException('City is required');
      const cityName = cityComponent?.long_name?.trim() || input.city.trim();
      if (
        state &&
        !this.stateMatches(input.state, state.long_name, state.short_name)
      )
        throw new UnprocessableEntityException(
          'Address does not match the supplied state',
        );
      const canonicalInputState = this.canonicalState(input.state);
      const normalizedState = state
        ? this.canonicalState(state.long_name)
        : canonicalInputState;
      return {
        ...input,
        city: cityName,
        state: canonicalInputState,
        normalizedAddress: result.formatted_address,
        placeId: result.place_id,
        latitude: result.geometry.location.lat,
        longitude: result.geometry.location.lng,
        normalizedCity: this.normalize(cityName),
        normalizedState: this.normalize(normalizedState),
      };
    } catch (error) {
      if (error instanceof UnprocessableEntityException) throw error;
      throw new BadGatewayException('Address provider is unavailable');
    }
  }

  async distance(origin: GeocodedAddress, destination: GeocodedAddress) {
    const settings = this.settings();
    if (!settings) return this.localDistance(origin, destination);
    const { apiKey, timeout } = settings;
    try {
      const url = new URL(
        'https://maps.googleapis.com/maps/api/distancematrix/json',
      );
      url.searchParams.set('origins', `${origin.latitude},${origin.longitude}`);
      url.searchParams.set(
        'destinations',
        `${destination.latitude},${destination.longitude}`,
      );
      url.searchParams.set('key', apiKey);
      const response = await fetch(url, {
        signal: AbortSignal.timeout(timeout),
      });
      if (!response.ok) throw new Error('HTTP failure');
      const body = (await response.json()) as any;
      const route = body.rows?.[0]?.elements?.[0];
      if (body.status !== 'OK' || route?.status !== 'OK')
        throw new UnprocessableEntityException('No drivable route was found');
      return {
        distanceMetres: Number(route.distance.value),
        durationSeconds: Number(route.duration.value),
      };
    } catch (error) {
      if (error instanceof UnprocessableEntityException) throw error;
      throw new BadGatewayException('Distance provider is unavailable');
    }
  }

  private localGeocode(input: AddressInput): GeocodedAddress {
    const normalizedCity = this.normalize(input.city);
    const normalizedState = this.normalize(input.state);
    const digest = createHash('sha256')
      .update(
        [
          input.address,
          input.landmark,
          normalizedCity,
          normalizedState,
          input.postalCode,
        ]
          .filter(Boolean)
          .join('|'),
      )
      .digest();
    // Deterministic development-only coordinates within roughly 10 km of a
    // stable Nigerian origin. They keep local quote flows reproducible without
    // pretending to be production geocoding.
    const latitude = 6.5244 + (digest.readUInt16BE(0) / 65_535 - 0.5) * 0.12;
    const longitude = 3.3792 + (digest.readUInt16BE(2) / 65_535 - 0.5) * 0.12;
    return {
      ...input,
      normalizedAddress: [
        input.address.trim(),
        input.city.trim(),
        input.state.trim(),
        'Nigeria',
      ].join(', '),
      placeId: `local:${digest.toString('hex').slice(0, 24)}`,
      latitude,
      longitude,
      normalizedCity,
      normalizedState,
    };
  }

  private localDistance(origin: GeocodedAddress, destination: GeocodedAddress) {
    const radians = (degrees: number) => (degrees * Math.PI) / 180;
    const earthRadiusMetres = 6_371_000;
    const latitudeDelta = radians(destination.latitude - origin.latitude);
    const longitudeDelta = radians(destination.longitude - origin.longitude);
    const a =
      Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(radians(origin.latitude)) *
        Math.cos(radians(destination.latitude)) *
        Math.sin(longitudeDelta / 2) ** 2;
    const directMetres =
      earthRadiusMetres * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceMetres = Math.max(500, Math.round(directMetres * 1.25));
    return {
      distanceMetres,
      durationSeconds: Math.max(
        300,
        Math.round(distanceMetres / (25_000 / 3_600)),
      ),
    };
  }

  private normalize(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/\s+state$/, '');
  }

  private stateMatches(inputState: string, ...googleStates: string[]) {
    const expected = this.canonicalState(inputState);
    return googleStates.some(
      (candidate) => this.canonicalState(candidate) === expected,
    );
  }

  private canonicalState(raw: string) {
    const norm = this.normalize(raw);
    if (norm.includes('federal capital') || norm === 'fct') return 'FCT';
    const states = [
      'Abia',
      'Adamawa',
      'Akwa Ibom',
      'Anambra',
      'Bauchi',
      'Bayelsa',
      'Benue',
      'Borno',
      'Cross River',
      'Delta',
      'Ebonyi',
      'Edo',
      'Ekiti',
      'Enugu',
      'FCT',
      'Gombe',
      'Imo',
      'Jigawa',
      'Kaduna',
      'Kano',
      'Katsina',
      'Kebbi',
      'Kogi',
      'Kwara',
      'Lagos',
      'Nasarawa',
      'Niger',
      'Ogun',
      'Ondo',
      'Osun',
      'Oyo',
      'Plateau',
      'Rivers',
      'Sokoto',
      'Taraba',
      'Yobe',
      'Zamfara',
    ];
    const match = states.find(
      (state) =>
        this.normalize(state) === norm ||
        norm.startsWith(this.normalize(state)),
    );
    return match ?? raw.replace(/\s+state$/i, '').trim();
  }
}
