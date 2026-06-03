package com.DevBridge.devbridge.domain.user.entity;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/**
 * DB의 기존 'CLIENT'/'PARTNER'/'USER'/'PRO' 값과 신규 'FREE'/'STANDARD'/'PREMIUM' 값을 모두 읽는 JPA 컨버터.
 * 쓸 때는 항상 'FREE'/'STANDARD'/'PREMIUM'으로 저장한다.
 */
@Converter
public class UserTypeConverter implements AttributeConverter<User.UserType, String> {

    @Override
    public String convertToDatabaseColumn(User.UserType attribute) {
        if (attribute == null) return null;
        return attribute.name();
    }

    @Override
    public User.UserType convertToEntityAttribute(String dbData) {
        if (dbData == null) return null;
        return switch (dbData.toUpperCase()) {
            case "CLIENT", "USER", "FREE" -> User.UserType.FREE;
            case "PARTNER", "PRO", "STANDARD" -> User.UserType.STANDARD;
            case "PREMIUM" -> User.UserType.PREMIUM;
            default -> User.UserType.FREE;
        };
    }
}
