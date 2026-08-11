import { IsEmail, IsString, MinLength, MaxLength, IsOptional, IsUUID } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  // Aligné avec l'indice affiché dans la maquette d'inscription :
  // minimum 10 caractères, une majuscule et un chiffre — la vérification
  // du contenu (majuscule/chiffre) se fait via un @Matches en plus si désiré.
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  addressText?: string;

  @IsOptional()
  @IsUUID()
  regionId?: string;
}
