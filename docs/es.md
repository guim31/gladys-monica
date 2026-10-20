# Monica

Los cumpleaños y recordatorios de su [Monica](https://www.monicahq.com) (el
CRM personal libre) en Gladys: quién cumple años hoy, quién los cumple esta
semana, qué recordatorios caen hoy. Una escena puede enviarle un mensaje la
mañana de un cumpleaños, avisarle una semana antes para el regalo, y Gladys
puede leer en voz alta los cumpleaños de la semana.

> **Sus comentarios son bienvenidos.** Esta integración se ha probado con un
> servidor Monica 4 real (imagen Docker oficial `monica:4`, octubre de 2026),
> aún no en el uso diario. Si algo no funciona como se describe, dígalo en el
> [foro de Gladys](https://community.gladysassistant.com) o en las
> [issues](https://github.com/guim31/gladys-monica/issues).

## Lo que necesita

- Gladys Assistant 5.1.0 o posterior.
- Un **Monica 4 autoalojado** (la imagen Docker `monica:4` o una instalación
  4.x), accesible desde Gladys. Monica 5 («chandler») aún no tiene API: no es
  compatible.
- Un **token de acceso personal** de un usuario de Monica. En Monica:
  **Settings** → **API** → **Personal access tokens** → **Create new token**,
  dele un nombre (`Gladys`) y cópielo: Monica solo lo muestra una vez. La
  integración solo lee: nunca cambia nada en Monica.

## Configuración

1. En Gladys, **Integraciones** → instale **Monica**.
2. En la pantalla **Configuración** de la integración:
   - **Dirección**: la dirección de Monica como en su navegador, p. ej.
     `http://192.168.1.20:8080` o `https://monica.example.org`;
   - **Token de acceso personal**: el token creado arriba;
   - **Hora de los eventos de escena** (08:00 por defecto): cuándo los
     cumpleaños y recordatorios del día activan sus escenas;
   - **Intervalo de actualización** (1 hora por defecto, de 15 minutos a
     6 horas);
   - **Aceptar certificados autofirmados**: solo para su propio servidor en
     `https://` con un certificado autofirmado;
   - **Idioma de los nombres de funciones**: francés por defecto.
3. **Probar la conexión**: Gladys lee Monica e indica cuántos cumpleaños y
   recordatorios ha encontrado.
4. En la pestaña **Descubrimiento**, añada el dispositivo **Monica**.

Monica permite 60 solicitudes por minuto y por token. Una lectura cuesta una
solicitud por cada 100 contactos y 100 recordatorios, más una: muy por
debajo, incluso con una agenda grande.

## Dispositivos

Un dispositivo **Monica** por cuenta de Monica, con estas funciones:

| Función                  | Lo que indica                                                       |
| ------------------------ | ------------------------------------------------------------------- |
| Cumpleaños hoy           | los contactos que cumplen años hoy                                  |
| Cumpleaños en 7 días     | los cumpleaños de hoy a dentro de 6 días                            |
| Recordatorios de hoy     | los recordatorios de Monica que caen hoy (salvo los de cumpleaños)  |
| Días hasta el cumpleaños | días hasta el próximo cumpleaños, 0 si es hoy                       |
| Próximo cumpleaños       | el nombre de la próxima persona que los cumple, «Ninguno» si no hay |

Lo que cuenta como cumpleaños:

- un contacto con fecha de nacimiento conocida; si solo se conocen el día y
  el mes, no hay edad;
- se excluyen los contactos fallecidos, archivados y parciales (familiares
  sin ficha propia), así como una fecha de nacimiento introducida solo como
  edad («unos 40 años»);
- nacido un 29 de febrero: se celebra el 28 de febrero en un año no bisiesto.

Lo que cuenta como recordatorio: todos los recordatorios de Monica (una vez,
cada N semanas, meses o años), salvo los recordatorios «Wish happy birthday»
que Monica crea para cada cumpleaños, ya contados como cumpleaños. Un
recordatorio mensual el día 31 cae el último día de los meses más cortos.

## Panel

El widget **Próximos cumpleaños** muestra dos casillas (cumpleaños y
recordatorios de hoy), los seis próximos cumpleaños con su fecha y la edad
cumplida, y los recordatorios de los próximos 7 días con su contacto. Añádalo
a un panel con **Editar** → **Añadir un widget**. Si Monica no responde, el
widget conserva los últimos datos conocidos bajo un breve aviso.

## Escenas

### Disparadores

Los eventos del día se activan **una vez al día**, a la **hora de los eventos
de escena** elegida en la configuración (o en la primera lectura posterior,
si Gladys o Monica estaban detenidos). Un cumpleaños o un recordatorio
añadido más tarde en el día se activa en la lectura siguiente. Las variables
contienen nombres: piense en quién leerá los mensajes que envíe con ellas.

- **Cumpleaños hoy (Monica)**: un contacto cumple años hoy. Filtro opcional:
  **Nombre** (nombre y apellido exactamente como en Monica). Variables:
  nombre, nombre de pila, edad cumplida (vacía si se desconoce el año), fecha
  del cumpleaños, número del contacto de Monica.
- **Cumpleaños dentro de N días (Monica)**: el cumpleaños de un contacto es
  dentro de N días. Campo obligatorio **Días antes del cumpleaños**, de 1 (la
  víspera) a 30; filtro opcional **Nombre**. Las mismas variables, más los
  días restantes.
- **Recordatorio de hoy (Monica)**: un recordatorio cae hoy. Filtro opcional:
  **Título del recordatorio** (título exacto). Variables: título del
  recordatorio, nombre del contacto, número del recordatorio de Monica,
  número del contacto de Monica.

### Acciones

- **Leer los cumpleaños de la semana (Monica)**: Monica se vuelve a leer y la
  acción devuelve una **Frase**, por ejemplo «4 cumpleaños en los próximos 7
  días: Alice Martin (36 años) hoy, Bruno hoy, Chloé Durand (10 años) sábado
  y Inès lunes.», y el **Número de cumpleaños**, para enviar por mensaje o
  decir en voz alta. La frase sigue el idioma elegido en la configuración.

### Ideas de escenas

- **Mensaje de cumpleaños**: disparador «Cumpleaños hoy (Monica)» → enviar
  «Hoy es el cumpleaños de {{name}}» (y su edad, si se conoce).
- **Pensar en el regalo**: disparador «Cumpleaños dentro de N días (Monica)»
  con 7 días → mensaje «{{name}} cumple años dentro de una semana: piense en
  el regalo».
- **Lunes por la mañana**: cada lunes a las 08:00 → «Leer los cumpleaños de
  la semana (Monica)» → decir la frase en el altavoz de la cocina, o
  enviarla.
- **Recordatorio de llamada**: disparador «Recordatorio de hoy (Monica)» →
  mensaje «Recordatorio: {{title}} ({{contact_name}})».

## Solución de problemas

- **«Monica no responde»**: compruebe la dirección (con el puerto) y que
  Gladys la alcanza: Gladys funciona en Docker, `localhost` no es su
  servidor.
- **«token de acceso rechazado (¿revocado o caducado?)»**: cree un nuevo
  token de acceso personal en Monica y péguelo en la configuración.
- **«no hay ninguna API de Monica 4 en esta dirección»**: la dirección apunta
  a otra cosa, o a Monica 5, que no tiene API.
- **«la dirección redirige»**: Monica impone HTTPS: introduzca la dirección
  `https://`.
- **«certificado rechazado»**: marque «Aceptar certificados autofirmados»
  para su propio servidor.
- **Falta un cumpleaños**: compruebe en Monica que el contacto tiene fecha de
  nacimiento (no solo una edad) y que no está archivado ni fallecido.
- **Ningún evento de escena**: los eventos se envían una vez al día a la hora
  elegida en la configuración; los registros nunca muestran nombres
  (`LOG_LEVEL=debug` para el detalle de una lectura).

## Límites

- Solo Monica 4; Monica 5 no es compatible (sin API).
- Solo lectura: desde Gladys no se crea ni se modifica ningún contacto,
  cumpleaños ni recordatorio.
- Los eventos del día se envían una vez al día, no a la hora del
  recordatorio (un recordatorio de Monica tiene fecha, no hora).
- La próxima vez que cae un recordatorio la calcula la integración a partir
  de su fecha de inicio y su frecuencia, como hace Monica.
- Una cuenta de Monica por integración (la del token).
