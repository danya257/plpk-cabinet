# CORS для мобильного кабинета на nginx web.inter-soft.ru (прод-вариант, без туннеля)

Добавить в конфиг nginx (server-блок web.inter-soft.ru) внутрь `location /softfontest/hs/plpk/`
(или создать такой location рядом с существующим проксированием на Apache):

```nginx
location /softfontest/hs/plpk/ {
    # preflight отвечаем сами, ДО Basic-авторизации апстрима
    if ($request_method = OPTIONS) {
        add_header Access-Control-Allow-Origin  "https://danya257.github.io" always;
        add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Content-Type, Authorization, X-Ai-Path, X-Client" always;
        add_header Access-Control-Max-Age       "86400" always;
        return 204;
    }
    add_header Access-Control-Allow-Origin "https://danya257.github.io" always;

    proxy_pass http://<апстрим-как-в-текущем-конфиге>;
    proxy_read_timeout 180s;   # заодно лечит 504 на длинных ИИ-ответах
}
```

После `nginx -t && systemctl reload nginx`:
в настройках приложения (экран «Ещё» → Подключение) переключить режим «Вручную»
и указать адрес `https://web.inter-soft.ru/softfontest/hs`? — НЕТ: приложение ходит на
`<адрес>/plpk/<метод>`, поэтому указать `https://web.inter-soft.ru/softfontest/hs`.

Авторизация Basic (AMI) при прямом варианте вводится… публикацией не запрашивается у
приложения — поэтому либо оставить шлюз, либо разрешить на публикации анонимный доступ
(пользователь в default.vrd). Рекомендуемый прод-путь: перенести логику шлюза (Basic внутри)
на сервер Интерсофта рядом с nginx и проксировать `location /plpk/` на него.
